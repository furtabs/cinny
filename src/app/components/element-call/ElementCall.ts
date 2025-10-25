import {
  MatrixEvent,
  MatrixClient,
  MatrixEventEvent,
  ClientEvent,
  RoomStateEvent,
  KnownMembership,
  Room,
} from 'matrix-js-sdk';

import { ClientWidgetApi, type IRoomEvent, Widget } from 'matrix-widget-api';
import { EventEmitter } from 'events';
import { logger } from 'matrix-js-sdk/src/logger';

import { arrayFastClone, elementCallCapabilities } from './utils';
import CallWidgetDriver from './CallWidgetDriver';

export enum ElementCallIntent {
  StartCall = 'start_call',
  JoinExisting = 'join_existing',
  StartCallDM = 'start_call_dm',
  JoinExistingDM = 'join_existing_dm',
}

function createCallWidget(room: Room, client: MatrixClient, intent: string): Widget {
  const perParticipantE2EE = room?.hasEncryptionStateEvent() ?? false;

  const baseUrl = new URL(window.location.href).origin;
  const url = new URL('./widgets/element-call/index.html#', baseUrl); // this strips hash fragment from baseUrl
  const widgetId = 'io-element-call-widget-id';
  // Splice together the Element Call URL for this call
  const paramsHash = new URLSearchParams({
    perParticipantE2EE: perParticipantE2EE ? 'true' : 'false',
    intent,
    userId: client.getSafeUserId(),
    deviceId: client.getDeviceId() ?? '',
    roomId: room.roomId,
    baseUrl: client.baseUrl,
    lang: 'en-EN',
    theme: 'light',
  });
  const paramsSearch = new URLSearchParams({
    widgetId,
    parentUrl: window.location.href.split('#', 2)[0],
  });

  url.search = paramsSearch.toString();
  const replacedUrl = paramsHash.toString().replace(/%24/g, '$');
  url.hash = `#?${replacedUrl}`;

  return new Widget({
    id: widgetId,
    creatorUserId: client.getSafeUserId(),
    name: 'Element Call',
    type: 'm.call',
    url: url.toString(),
    waitForIframeLoad: false,
    data: {},
  });
}

export default class ElementCall extends EventEmitter {
  private messaging: ClientWidgetApi | null = null;

  public widget: Widget;

  private readUpToMap: { [roomId: string]: string } = {}; // room ID to event ID

  // Holds events that should be fed to the widget once they finish decrypting
  private eventsToFeed = new WeakSet<MatrixEvent>();

  public constructor(
    private client: MatrixClient,
    private room: Room,
    isDirect: boolean,
    callOngoing: boolean
  ) {
    super();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const intent = new Map([
      ['start_call_dm', ElementCallIntent.StartCallDM],
      ['join_existing_dm', ElementCallIntent.JoinExistingDM],
      ['start_call', ElementCallIntent.StartCall],
      ['join_existing', ElementCallIntent.JoinExisting],
    ]).get((callOngoing ? 'join_existing' : 'start_call') + (isDirect ? '_dm' : ''))!;

    this.widget = createCallWidget(this.room, this.client, intent);
  }

  public get widgetApi(): ClientWidgetApi | null {
    return this.messaging;
  }

  /**
   * The URL to use in the iframe
   */
  public get embedUrl(): string {
    return this.widget.templateUrl;
  }

  /**
   * This starts the messaging for the widget if it is not in the state `started` yet.
   * @param iframe the iframe the widget should use
   */
  public startMessaging(iframe: HTMLIFrameElement) {
    if (this.messaging) return;

    const userId = this.client.getSafeUserId();
    const deviceId = this.client.getDeviceId() ?? undefined;
    const driver = new CallWidgetDriver(
      this.client,
      elementCallCapabilities(this.room.roomId, userId, deviceId),
      this.room.roomId
    );

    this.messaging = new ClientWidgetApi(this.widget, iframe, driver);
    this.messaging.on('preparing', () => this.emit('preparing'));
    this.messaging.on('error:preparing', (err: unknown) => this.emit('error:preparing', err));
    this.messaging.once('ready', () => {
      this.emit('ready');
    });
    this.messaging.on('capabilitiesNotified', () => this.emit('capabilitiesNotified'));

    // Room widgets get locked to the room they were added in
    this.messaging.setViewedRoomId(this.room.roomId);

    // Populate the map of "read up to" events for this widget with the current event in every room.
    // This is a bit inefficient, but should be okay. We do this for all rooms in case the widget
    // requests timeline capabilities in other rooms down the road. It's just easier to manage here.
    this.client.getRooms().forEach((room) => {
      // Timelines are most recent last
      const events = room.getLiveTimeline()?.getEvents() || [];
      const roomEvent = events[events.length - 1];
      if (!roomEvent) return; // force later code to think the room is fresh
      this.readUpToMap[room.roomId] = roomEvent.getId()!;
    });

    // Attach listeners for feeding events - the underlying widget classes handle permissions for us
    this.client.on(ClientEvent.Event, this.onEvent);
    this.client.on(MatrixEventEvent.Decrypted, this.onEventDecrypted);
    this.client.on(RoomStateEvent.Events, this.onStateUpdate);
    this.client.on(ClientEvent.ToDeviceEvent, this.onToDeviceEvent);
  }

  /**
   * Stops the widget messaging for if it is started. Skips stopping if it is an active
   * widget.
   * @param opts
   */
  public stopMessaging(): void {
    if (this.messaging) {
      this.messaging.stop();
    }
    this.messaging = null;

    this.client.off(ClientEvent.Event, this.onEvent);
    this.client.off(MatrixEventEvent.Decrypted, this.onEventDecrypted);
    this.client.off(RoomStateEvent.Events, this.onStateUpdate);
    this.client.off(ClientEvent.ToDeviceEvent, this.onToDeviceEvent);

    // Clear internal state
    this.readUpToMap = {};
    this.eventsToFeed = new WeakSet<MatrixEvent>();
  }

  private onEvent = (ev: MatrixEvent): void => {
    this.client.decryptEventIfNeeded(ev);
    this.feedEvent(ev);
  };

  private onEventDecrypted = (ev: MatrixEvent): void => {
    this.feedEvent(ev);
  };

  private onStateUpdate = (ev: MatrixEvent): void => {
    if (this.messaging === null) return;
    const raw = ev.getEffectiveEvent();
    this.messaging.feedStateUpdate(raw as IRoomEvent).catch((e) => {
      logger.error('Error sending state update to widget: ', e);
    });
  };

  private onToDeviceEvent = async (ev: MatrixEvent): Promise<void> => {
    await this.client.decryptEventIfNeeded(ev);
    if (ev.isDecryptionFailure()) return;
    await this.messaging?.feedToDevice(ev.getEffectiveEvent() as IRoomEvent, ev.isEncrypted());
  };

  /**
   * Determines whether the event has a relation to an unknown parent.
   */
  private relatesToUnknown(ev: MatrixEvent): boolean {
    // Replies to unknown events don't count
    if (!ev.relationEventId || ev.replyEventId) return false;
    const room = this.client.getRoom(ev.getRoomId());
    return room === null || !room.findEventById(ev.relationEventId);
  }

  /**
   * Advances the "read up to" marker for a room to a certain event. No-ops if
   * the event is before the marker.
   * @returns Whether the "read up to" marker was advanced.
   */
  private advanceReadUpToMarker(ev: MatrixEvent): boolean {
    const evId = ev.getId();
    if (evId === undefined) return false;
    const roomId = ev.getRoomId();
    if (roomId === undefined) return false;
    const room = this.client.getRoom(roomId);
    if (room === null) return false;

    const upToEventId = this.readUpToMap[ev.getRoomId()!];
    if (!upToEventId) {
      // There's no marker yet; start it at this event
      this.readUpToMap[roomId] = evId;
      return true;
    }

    // Small optimization for exact match (skip the search)
    if (upToEventId === evId) return false;

    // Timelines are most recent last, so reverse the order and limit ourselves to 100 events
    // to avoid overusing the CPU.
    const timeline = room.getLiveTimeline();
    const events = arrayFastClone(timeline.getEvents()).reverse().slice(0, 100);
    function isRelevantTimelineEvent(timelineEvent: MatrixEvent): boolean {
      return timelineEvent.getId() === upToEventId || timelineEvent.getId() === ev.getId();
    }
    const possibleMarkerEv = events.find(isRelevantTimelineEvent);
    if (possibleMarkerEv?.getId() === upToEventId) {
      // The event must be somewhere before the "read up to" marker
      return false;
    }
    if (possibleMarkerEv?.getId() === ev.getId()) {
      // The event is after the marker; advance it
      this.readUpToMap[roomId] = evId;
      return true;
    }

    // We can't say for sure whether the widget has seen the event; let's
    // just assume that it has
    return false;
  }

  /**
   * Determines whether the event comes from a room that we've been invited to
   * (in which case we likely don't have the full timeline).
   */
  private isFromInvite(ev: MatrixEvent): boolean {
    const room = this.client.getRoom(ev.getRoomId());
    return room?.getMyMembership() === KnownMembership.Invite;
  }

  private feedEvent(ev: MatrixEvent): void {
    if (this.messaging === null) return;
    if (
      // If we had decided earlier to feed this event to the widget, but
      // it just wasn't ready, give it another try
      this.eventsToFeed.delete(ev) ||
      // Skip marker timeline check for events with relations to unknown parent because these
      // events are not added to the timeline here and will be ignored otherwise:
      // https://github.com/matrix-org/matrix-js-sdk/blob/d3dfcd924201d71b434af3d77343b5229b6ed75e/src/models/room.ts#L2207-L2213
      this.relatesToUnknown(ev) ||
      // Skip marker timeline check for rooms where membership is
      // 'invite', otherwise the membership event from the invitation room
      // will advance the marker and new state events will not be
      // forwarded to the widget.
      this.isFromInvite(ev) ||
      // Check whether this event would be before or after our "read up to" marker. If it's
      // before, or we can't decide, then we assume the widget will have already seen the event.
      // If the event is after, or we don't have a marker for the room,
      // then the marker will advance and we'll send it through.
      // This approach of "read up to" prevents widgets receiving decryption spam from startup or
      // receiving ancient events from backfill and such.
      this.advanceReadUpToMarker(ev)
    ) {
      // If the event is still being decrypted, remember that we want to
      // feed it to the widget (even if not strictly in the order given by
      // the timeline) and get back to it later
      if (ev.isBeingDecrypted() || ev.isDecryptionFailure()) {
        this.eventsToFeed.add(ev);
      } else {
        const raw = ev.getEffectiveEvent();
        this.messaging.feedEvent(raw as IRoomEvent).catch((e) => {
          logger.error('Error sending event to widget: ', e);
        });
      }
    }
  }
}
