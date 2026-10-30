/** Better Auth exposes this shared channel; replace its localStorage transport before client creation.
 * Only session invalidation signals cross tabs. Neither JWT nor user/session data reaches disk.
 * Protocol pinned and exercised against the installed official Neon SDK.
 */
export function installEphemeralAuthChannel() {
  const key=Symbol.for("better-auth:broadcast-channel");
  const target=globalThis as typeof globalThis & {[key:symbol]:unknown};
  if (target[key]) return;
  const channel=new BroadcastChannel("biosaude-better-auth");
  (channel as unknown as {unref?:()=>void}).unref?.();
  type Message={event?:string;data?:{trigger?:string};clientId?:string};
  const listeners=new Set<(message:Message)=>void>();
  channel.onmessage=event=>{for(const listener of listeners)listener(event.data);};
  target[key]={
    name:"biosaude-better-auth",
    post(message:Message) {
      channel.postMessage({event:"session",data:{trigger:message.data?.trigger},clientId:message.clientId});
    },
    subscribe(listener:(message:Message)=>void) {listeners.add(listener);return()=>{listeners.delete(listener);};},
    setup(){return()=>{};},
  };
}
