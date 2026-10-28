export interface SocialPerson { id: string; nickname: string; code: string }
export interface FriendRequest { id: string; from: SocialPerson; createdAt: number }
export interface DirectMessage { id: string; seq: number; clientId: string; from: string; to: string; text: string; createdAt: number }
export interface SocialFriend extends SocialPerson { unread: number }
export interface SocialSnapshot {
  revision: number;
  me: SocialPerson;
  friends: SocialFriend[];
  requests: FriendRequest[];
  outgoing: { id: string; to: SocialPerson; createdAt: number }[];
  messages: DirectMessage[];
}
export interface SocialState {
  serverUrl: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  error: string;
  snapshot: SocialSnapshot | null;
}
export type SocialAction =
  | { type: 'connect'; serverUrl: string; nickname: string }
  | { type: 'disconnect' }
  | { type: 'request'; code: string }
  | { type: 'respond'; requestId: string; accept: boolean }
  | { type: 'send'; to: string; text: string; clientId: string }
  | { type: 'read'; peerId: string; through: number };
