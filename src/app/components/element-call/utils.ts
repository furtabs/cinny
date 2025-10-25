import { logger } from 'matrix-js-sdk/lib/logger';

import { EventType } from 'matrix-js-sdk';
import { EventDirection, MatrixCapabilities, WidgetEventCapability } from 'matrix-widget-api';
import EventEmitter from 'events';
import { useEffect } from 'react';

function getCredentials() {
  const accessToken = localStorage.getItem('mx_access_token');
  const userId = localStorage.getItem('mx_user_id');
  const deviceId = localStorage.getItem('mx_device_id');
  return [accessToken, userId, deviceId];
}

export async function downloadFromUrlToFile(url: string, filename?: string): Promise<File> {
  const [accessToken] = getCredentials();
  try {
    const response = await fetch(url, {
      body: 'blob',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const file = new File([await response.blob()], filename || 'file', {
      type: response.type,
    });
    return file;
  } catch (error) {
    logger.error('Error downloading file', error);
    throw error;
  }
}
export type Diff<T> = { added: T[]; removed: T[] };

/**
 * Performs a diff on two arrays. The result is what is different with the
 * first array (`added` in the returned object means objects in B that aren't
 * in A). Shallow comparisons are used to perform the diff.
 * @param a The first array. Must be defined.
 * @param b The second array. Must be defined.
 * @returns The diff between the arrays.
 */
export function arrayDiff<T>(a: T[], b: T[]): Diff<T> {
  return {
    added: b.filter((i) => !a.includes(i)),
    removed: a.filter((i) => !b.includes(i)),
  };
}

export default function iterableDiff<T>(
  a: Iterable<T>,
  b: Iterable<T>
): { added: Iterable<T>; removed: Iterable<T> } {
  return arrayDiff(Array.from(a), Array.from(b));
}

/**
 * Clones an array as fast as possible, retaining references of the array's values.
 * @param a The array to clone. Must be defined.
 * @returns A copy of the array.
 */
export function arrayFastClone<T>(a: T[]): T[] {
  return a.slice(0, a.length);
}

export function elementCallCapabilities(
  inRoomId: string,
  clientUserId: string,
  clientDeviceId?: string
): Set<string> {
  const allowedCapabilities = new Set<string>();

  // This is a trusted Element Call widget that we control
  const addCapability = (type: string, state: boolean, dir: EventDirection, stateKey?: string) =>
    allowedCapabilities.add(
      state
        ? WidgetEventCapability.forStateEvent(dir, type, stateKey).raw
        : WidgetEventCapability.forRoomEvent(dir, type).raw
    );
  const addToDeviceCapability = (eventType: string, dir: EventDirection) =>
    allowedCapabilities.add(WidgetEventCapability.forToDeviceEvent(dir, eventType).raw);
  const recvState = (eventType: string, stateKey?: string) =>
    addCapability(eventType, true, EventDirection.Receive, stateKey);
  const sendState = (eventType: string, stateKey?: string) =>
    addCapability(eventType, true, EventDirection.Send, stateKey);
  const sendRecvToDevice = (eventType: string) => {
    addToDeviceCapability(eventType, EventDirection.Receive);
    addToDeviceCapability(eventType, EventDirection.Send);
  };
  const recvRoom = (eventType: string) => addCapability(eventType, false, EventDirection.Receive);
  const sendRoom = (eventType: string) => addCapability(eventType, false, EventDirection.Send);
  const sendRecvRoom = (eventType: string) => {
    recvRoom(eventType);
    sendRoom(eventType);
  };

  allowedCapabilities.add(MatrixCapabilities.AlwaysOnScreen);
  allowedCapabilities.add(MatrixCapabilities.MSC3846TurnServers);
  allowedCapabilities.add(`org.matrix.msc2762.timeline:${inRoomId}`);
  allowedCapabilities.add(MatrixCapabilities.MSC4157SendDelayedEvent);
  allowedCapabilities.add(MatrixCapabilities.MSC4157UpdateDelayedEvent);
  recvState(EventType.RoomMember);
  recvState('org.matrix.msc3401.call');
  recvState(EventType.RoomEncryption);
  recvState(EventType.RoomName);
  // For the legacy membership type
  sendState('org.matrix.msc3401.call.member', clientUserId);
  // For the session membership type compliant with MSC4143
  sendState('org.matrix.msc3401.call.member', `_${clientUserId}_${clientDeviceId}_m.call`);
  sendState('org.matrix.msc3401.call.member', `${clientUserId}_${clientDeviceId}_m.call`);
  sendState('org.matrix.msc3401.call.member', `_${clientUserId}_${clientDeviceId}`);
  sendState('org.matrix.msc3401.call.member', `${clientUserId}_${clientDeviceId}`);
  recvState('org.matrix.msc3401.call.member');
  // for determining auth rules specific to the room version
  recvState(EventType.RoomCreate);

  sendRoom('org.matrix.msc4075.rtc.notification');
  sendRecvRoom('io.element.call.encryption_keys');
  sendRecvRoom('org.matrix.rageshake_request');
  sendRecvRoom(EventType.Reaction);
  sendRecvRoom(EventType.RoomRedaction);
  sendRecvRoom('io.element.call.reaction');
  sendRecvRoom('org.matrix.msc4310.rtc.decline');

  sendRecvToDevice(EventType.CallInvite);
  sendRecvToDevice(EventType.CallCandidates);
  sendRecvToDevice(EventType.CallAnswer);
  sendRecvToDevice(EventType.CallHangup);
  sendRecvToDevice(EventType.CallReject);
  sendRecvToDevice(EventType.CallSelectAnswer);
  sendRecvToDevice(EventType.CallNegotiate);
  sendRecvToDevice(EventType.CallSDPStreamMetadataChanged);
  sendRecvToDevice(EventType.CallSDPStreamMetadataChangedPrefix);
  sendRecvToDevice(EventType.CallReplaces);
  sendRecvToDevice(EventType.CallEncryptionKeysPrefix);

  return allowedCapabilities;
}

// Shortcut for registering a listener on an EventTarget
// Copied from element-web
export function useEventEmitter<T>(
  emitter: EventEmitter | null | undefined,
  eventType: string,
  listener: (event: T) => void
): void {
  useEffect((): (() => void) => {
    if (emitter) {
      emitter.on(eventType, listener);
      return (): void => {
        emitter.off(eventType, listener);
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return () => {};
  }, [emitter, eventType, listener]);
}
