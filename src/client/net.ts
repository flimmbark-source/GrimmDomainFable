/**
 * Connection to the authoritative server (Colyseus SDK 0.18). The client only
 * ever sends Commands and only ever receives its own projected Snapshots.
 */
import { Client, type Room } from '@colyseus/sdk';
import {
  DEFAULT_SERVER_PORT,
  MSG,
  ROOM_NAME,
  type Command,
  type JoinOptions,
  type Snapshot,
  type WelcomeMessage,
} from '../shared/protocol.ts';

export interface Connection {
  welcome: WelcomeMessage;
  send(command: Command): void;
  onSnapshot(handler: (snapshot: Snapshot) => void): void;
  onClosed(handler: (reason: string) => void): void;
  leave(): void;
}

/** Dev: Vite serves the page and the game server runs on its own port.
 *  Production build: the game server serves the page, so use the same origin. */
export function serverUrl(): string {
  const override = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (override) return override;
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:${DEFAULT_SERVER_PORT}`;
  return location.origin;
}

export async function connect(options: JoinOptions): Promise<Connection> {
  const client = new Client(serverUrl());
  const room: Room = await client.joinOrCreate(ROOM_NAME, options);

  let snapshotHandler: (snapshot: Snapshot) => void = () => {};
  let latestEarly: Snapshot | null = null;
  room.onMessage(MSG.snapshot, (snapshot: Snapshot) => {
    latestEarly = snapshot;
    snapshotHandler(snapshot);
  });

  const welcome = await new Promise<WelcomeMessage>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not send a welcome message')), 5000);
    room.onMessage(MSG.welcome, (message: WelcomeMessage) => {
      clearTimeout(timer);
      resolve(message);
    });
  });

  return {
    welcome,
    send: (command) => room.send(MSG.command, command),
    onSnapshot: (handler) => {
      snapshotHandler = handler;
      if (latestEarly) handler(latestEarly);
    },
    onClosed: (handler) => {
      room.onLeave((code: number) => handler(`connection closed (code ${code})`));
      room.onError((code: number, message?: string) => handler(`room error ${code}: ${message ?? ''}`));
    },
    leave: () => void room.leave(),
  };
}
