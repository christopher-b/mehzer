/** Whether the browser thinks it is online. Not fully reliable, so it only drives a banner, never disables anything. */
class OnlineState {
	/** Assume online until the browser says otherwise (and on the server). */
	value = $state(true);

	/** Start following the browser. Call once the page is mounted; returns the cleanup. */
	init(onchange?: (online: boolean) => void) {
		const set = (online: boolean) => {
			if (online === this.value) return;
			this.value = online;
			onchange?.(online);
		};
		const goOnline = () => set(true);
		const goOffline = () => set(false);
		this.value = navigator.onLine;
		window.addEventListener('online', goOnline);
		window.addEventListener('offline', goOffline);
		return () => {
			window.removeEventListener('online', goOnline);
			window.removeEventListener('offline', goOffline);
		};
	}
}

export const online = new OnlineState();
