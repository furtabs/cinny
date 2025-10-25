/* eslint-disable no-plusplus */
/* eslint-disable no-dupe-class-members */
/* eslint-disable lines-between-class-members */
/* eslint-disable class-methods-use-this */
import {
  type Capability,
  type IOpenIDCredentials,
  type IOpenIDUpdate,
  type ISendDelayedEventDetails,
  type ISendEventDetails,
  type ITurnServer,
  type IReadEventRelationsResult,
  type IRoomEvent,
  OpenIDRequestState,
  type SimpleObservable,
  WidgetDriver,
  type IWidgetApiErrorResponseDataDetails,
  type ISearchUserDirectoryResult,
  type IGetMediaConfigResult,
  type UpdateDelayedEventAction,
} from 'matrix-widget-api';
import {
  ClientEvent,
  type ITurnServer as IClientTurnServer,
  EventType,
  type IContent,
  MatrixError,
  type MatrixEvent,
  Direction,
  type SendDelayedEventResponse,
  type StateEvents,
  type TimelineEvents,
  MatrixClient,
  getHttpUriForMxc,
} from 'matrix-js-sdk';
import { logger } from 'matrix-js-sdk/lib/logger';
import iterableDiff, { downloadFromUrlToFile } from './utils';

// TODO: Purge this from the universe

const normalizeTurnServer = ({ urls, username, credential }: IClientTurnServer): ITurnServer => ({
  uris: urls,
  username,
  password: credential,
});

export default class CallWidgetDriver extends WidgetDriver {
  // TODO: Refactor widgetKind into the Widget class
  public constructor(
    private client: MatrixClient,
    private allowedCapabilities = new Set<Capability>(),
    private inRoomId: string
  ) {
    super();
  }

  public async validateCapabilities(requested: Set<Capability>): Promise<Set<Capability>> {
    // Check to see if any capabilities aren't automatically accepted (such as sticker pickers
    // allowing stickers to be sent). If there are excess capabilities to be approved, the user
    // will be prompted to accept them.
    const missing = new Set(iterableDiff(requested, this.allowedCapabilities).removed); // "removed" is "in A (requested) but not in B (allowed)"
    if (missing.size > 0) logger.error('missing widget capabilities', missing);
    return this.allowedCapabilities;
  }

  public async sendEvent<K extends keyof StateEvents>(
    eventType: K,
    content: StateEvents[K],
    stateKey: string | null,
    targetRoomId: string | null
  ): Promise<ISendEventDetails>;
  public async sendEvent<K extends keyof TimelineEvents>(
    eventType: K,
    content: TimelineEvents[K],
    stateKey: null,
    targetRoomId: string | null
  ): Promise<ISendEventDetails>;
  public async sendEvent(
    eventType: string,
    content: IContent,
    stateKey: string | null = null,
    targetRoomId: string | null = null
  ): Promise<ISendEventDetails> {
    const { client } = this;
    const roomId = targetRoomId || this.inRoomId;

    if (!client || !roomId) throw new Error('Not in a room or not attached to a client');

    let r: { event_id: string } | null;
    if (stateKey !== null) {
      // state event
      r = await client.sendStateEvent(
        roomId,
        eventType as keyof StateEvents,
        content as StateEvents[keyof StateEvents],
        stateKey
      );
    } else if (eventType === EventType.RoomRedaction) {
      // special case: extract the `redacts` property and call redact
      r = await client.redactEvent(roomId, content.redacts);
    } else {
      // message event
      r = await client.sendEvent(
        roomId,
        eventType as keyof TimelineEvents,
        content as TimelineEvents[keyof TimelineEvents]
      );
    }

    return { roomId, eventId: r.event_id };
  }

  /**
   * @experimental Part of MSC4140 & MSC4157
   * @see {@link WidgetDriver#sendDelayedEvent}
   */
  public async sendDelayedEvent<K extends keyof StateEvents>(
    delay: number | null,
    parentDelayId: string | null,
    eventType: K,
    content: StateEvents[K],
    stateKey: string | null,
    targetRoomId: string | null
  ): Promise<ISendDelayedEventDetails>;
  /**
   * @experimental Part of MSC4140 & MSC4157
   */
  public async sendDelayedEvent<K extends keyof TimelineEvents>(
    delay: number | null,
    parentDelayId: string | null,
    eventType: K,
    content: TimelineEvents[K],
    stateKey: null,
    targetRoomId: string | null
  ): Promise<ISendDelayedEventDetails>;
  public async sendDelayedEvent(
    delay: number | null,
    parentDelayId: string | null,
    eventType: string,
    content: IContent,
    stateKey: string | null = null,
    targetRoomId: string | null = null
  ): Promise<ISendDelayedEventDetails> {
    const { client } = this;
    const roomId = targetRoomId || this.inRoomId;

    if (!client || !roomId) throw new Error('Not in a room or not attached to a client');

    let delayOpts;
    if (delay !== null) {
      delayOpts = {
        delay,
        ...(parentDelayId !== null && { parent_delay_id: parentDelayId }),
      };
    } else if (parentDelayId !== null) {
      delayOpts = {
        parent_delay_id: parentDelayId,
      };
    } else {
      throw new Error('Must provide at least one of delay or parentDelayId');
    }

    let r: SendDelayedEventResponse | null;
    if (stateKey !== null) {
      // state event
      r = await client._unstable_sendDelayedStateEvent(
        roomId,
        delayOpts,
        eventType as keyof StateEvents,
        content as StateEvents[keyof StateEvents],
        stateKey
      );
    } else {
      // message event
      r = await client._unstable_sendDelayedEvent(
        roomId,
        delayOpts,
        null,
        eventType as keyof TimelineEvents,
        content as TimelineEvents[keyof TimelineEvents]
      );
    }

    return {
      roomId,
      delayId: r.delay_id,
    };
  }

  /**
   * @experimental Part of MSC4140 & MSC4157
   */
  public async updateDelayedEvent(
    delayId: string,
    action: UpdateDelayedEventAction
  ): Promise<void> {
    const { client } = this;

    if (!client) throw new Error('Not in a room or not attached to a client');

    await client._unstable_updateDelayedEvent(delayId, action);
  }

  /**
   * Implements {@link WidgetDriver#sendToDevice}
   */
  public async sendToDevice(
    eventType: string,
    encrypted: boolean,
    contentMap: { [userId: string]: { [deviceId: string]: object } }
  ): Promise<void> {
    const { client } = this;

    if (encrypted) {
      const crypto = client.getCrypto();
      if (!crypto) throw new Error('E2EE not enabled');

      // attempt to re-batch these up into a single request
      const invertedContentMap: { [content: string]: { userId: string; deviceId: string }[] } = {};
      Object.keys(contentMap).forEach((userId) => {
        const userContentMap = contentMap[userId];
        Object.keys(userContentMap).forEach((deviceId) => {
          const content = userContentMap[deviceId];
          const stringifiedContent = JSON.stringify(content);
          invertedContentMap[stringifiedContent] = invertedContentMap[stringifiedContent] || [];
          invertedContentMap[stringifiedContent].push({ userId, deviceId });
        });
      });

      await Promise.all(
        Object.entries(invertedContentMap).map(async ([stringifiedContent, recipients]) => {
          const batch = await crypto.encryptToDeviceMessages(
            eventType,
            recipients,
            JSON.parse(stringifiedContent)
          );

          await client.queueToDevice(batch);
        })
      );
    } else {
      await client.queueToDevice({
        eventType,
        batch: Object.entries(contentMap).flatMap(([userId, userContentMap]) =>
          Object.entries(userContentMap).map(([deviceId, content]) => ({
            userId,
            deviceId,
            payload: content,
          }))
        ),
      });
    }
  }

  /**
   * Reads all events of the given type, and optionally `msgtype` (if applicable/defined),
   * the user has access to. The widget API will have already verified that the widget is
   * capable of receiving the events. Less events than the limit are allowed to be returned,
   * but not more.
   * @param roomId The ID of the room to look within.
   * @param eventType The event type to be read.
   * @param msgtype The msgtype of the events to be read, if applicable/defined.
   * @param stateKey The state key of the events to be read, if applicable/defined.
   * @param limit The maximum number of events to retrieve. Will be zero to denote "as many as
   * possible".
   * @param since When null, retrieves the number of events specified by the "limit" parameter.
   * Otherwise, the event ID at which only subsequent events will be returned, as many as specified
   * in "limit".
   * @returns {Promise<IRoomEvent[]>} Resolves to the room events, or an empty array.
   */
  public async readRoomTimeline(
    roomId: string,
    eventType: string,
    msgtype: string | undefined,
    stateKey: string | undefined,
    limit: number,
    since: string | undefined
  ): Promise<IRoomEvent[]> {
    // relatively arbitrary
    const timelineLimit =
      limit > 0 ? Math.min(limit, Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;

    const room = this.client.getRoom(roomId);
    if (room === null) return [];
    const results: MatrixEvent[] = [];
    const events = room.getLiveTimeline().getEvents(); // timelines are most recent last
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (results.length >= timelineLimit) break;
      if (since !== undefined && ev.getId() === since) break;

      if (
        ev.getType() === eventType &&
        !ev.isState() &&
        (eventType !== EventType.RoomMessage || !msgtype || msgtype === ev.getContent().msgtype) &&
        (ev.getStateKey() === undefined || stateKey === undefined || ev.getStateKey() === stateKey)
      ) {
        results.push(ev);
      }
    }

    return results.map((e) => e.getEffectiveEvent() as IRoomEvent);
  }

  /**
   * Reads the current values of all matching room state entries.
   * @param roomId The ID of the room.
   * @param eventType The event type of the entries to be read.
   * @param stateKey The state key of the entry to be read. If undefined,
   * all room state entries with a matching event type should be returned.
   * @returns {Promise<IRoomEvent[]>} Resolves to the events representing the
   * current values of the room state entries.
   */
  public async readRoomState(
    roomId: string,
    eventType: string,
    stateKey: string | undefined
  ): Promise<IRoomEvent[]> {
    const room = this.client.getRoom(roomId);
    if (room === null) return [];
    const state = room.getLiveTimeline().getState(Direction.Forward);
    if (state === undefined) return [];

    if (stateKey === undefined) {
      return state.getStateEvents(eventType).map((e) => e.getEffectiveEvent() as IRoomEvent);
    }
    const event = state.getStateEvents(eventType, stateKey);
    return event === null ? [] : [event.getEffectiveEvent() as IRoomEvent];
  }

  public async askOpenID(observer: SimpleObservable<IOpenIDUpdate>): Promise<void> {
    // TODO: Fully functional widget driver a user prompt is required here, see element web
    const getToken = (): Promise<IOpenIDCredentials> => this.client.getOpenIdToken();
    return observer.update({ state: OpenIDRequestState.Allowed, token: await getToken() });
  }

  public async navigate(uri: string): Promise<void> {
    // navigateToPermalink(uri);
    // TODO: Dummy code until we figured out navigateToPermalink implementation
    if (uri) return Promise.resolve();
    return Promise.reject();
  }

  public async *getTurnServers(): AsyncGenerator<ITurnServer> {
    const { client } = this;
    if (!client.pollingTurnServers || !client.getTurnServers().length) return;

    let setTurnServer: (server: ITurnServer) => void;
    let setError: (error: Error) => void;

    const onTurnServers = ([server]: IClientTurnServer[]): void =>
      setTurnServer(normalizeTurnServer(server));
    const onTurnServersError = (error: Error, fatal: boolean): void => {
      if (fatal) setError(error);
    };

    client.on(ClientEvent.TurnServers, onTurnServers);
    client.on(ClientEvent.TurnServersError, onTurnServersError);

    try {
      const initialTurnServer = client.getTurnServers()[0];
      yield normalizeTurnServer(initialTurnServer);

      const waitForTurnServer = (): Promise<ITurnServer> =>
        new Promise<ITurnServer>((resolve, reject) => {
          setTurnServer = resolve;
          setError = reject;
        });

      // Repeatedly listen for new TURN servers until an error occurs or
      // the caller stops this generator
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        yield await waitForTurnServer();
      }
    } finally {
      // The loop was broken - clean up
      client.off(ClientEvent.TurnServers, onTurnServers);
      client.off(ClientEvent.TurnServersError, onTurnServersError);
    }
  }

  public async readEventRelations(
    eventId: string,
    roomId?: string,
    relationType?: string,
    eventType?: string,
    from?: string,
    to?: string,
    limit?: number,
    direction?: 'f' | 'b'
  ): Promise<IReadEventRelationsResult> {
    const { client } = this;
    const dir = direction as Direction;
    const rId = roomId || this.inRoomId;

    if (typeof rId !== 'string') {
      throw new Error('Error while reading the current room');
    }

    const { events, nextBatch, prevBatch } = await client.relations(
      rId,
      eventId,
      relationType ?? null,
      eventType ?? null,
      {
        from,
        to,
        limit,
        dir,
      }
    );

    return {
      chunk: events.map((e) => e.getEffectiveEvent() as IRoomEvent),
      nextBatch: nextBatch ?? undefined,
      prevBatch: prevBatch ?? undefined,
    };
  }

  public async searchUserDirectory(
    searchTerm: string,
    limit?: number
  ): Promise<ISearchUserDirectoryResult> {
    const { client } = this;

    const { limited, results } = await client.searchUserDirectory({ term: searchTerm, limit });

    return {
      limited,
      results: results.map((r) => ({
        userId: r.user_id,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
      })),
    };
  }

  public async getMediaConfig(): Promise<IGetMediaConfigResult> {
    const { client } = this;

    return client.getMediaConfig();
  }

  public async uploadFile(file: XMLHttpRequestBodyInit): Promise<{ contentUri: string }> {
    const { client } = this;

    const uploadResult = await client.uploadContent(file);

    return { contentUri: uploadResult.content_uri };
  }

  /**
   * Download a file from the media repository on the homeserver.
   *
   * @param contentUri - the MXC URI of the file to download
   * @returns an object with: file - response contents as Blob
   */
  public async downloadFile(contentUri: string): Promise<{ file: XMLHttpRequestBodyInit }> {
    const httpUrl = getHttpUriForMxc(
      this.client.baseUrl,
      contentUri,
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      true
    );
    const file = await downloadFromUrlToFile(httpUrl);
    return { file };
  }

  /**
   * Gets the IDs of all joined or invited rooms currently known to the
   * client.
   * @returns The room IDs.
   */
  public getKnownRooms(): string[] {
    return this.client.getVisibleRooms(false).map((r) => r.roomId);
  }

  /**
   * Expresses a {@link MatrixError} as a JSON payload
   * for use by Widget API error responses.
   * @param error The error to handle.
   * @returns The error expressed as a JSON payload,
   * or undefined if it is not a {@link MatrixError}.
   */
  public processError(error: unknown): IWidgetApiErrorResponseDataDetails | undefined {
    return error instanceof MatrixError
      ? {
          matrix_api_error: error.asWidgetApiErrorData(),
        }
      : undefined;
  }
}
