import {
  App,
  AppBootMode,
  AppInstallProps,
  AppSuspendMode,
  AppView,
  AppViewProps,
  Efb,
  RequiredProps,
  TVNode,
} from "@efb/efb-api";
import { VNode } from "@microsoft/msfs-sdk";
import "./FlightDeckEFB.scss";

declare const BASE_URL: string;
declare const Coherent: {
  call<T = unknown>(name: string, ...args: unknown[]): Promise<T>;
};
declare function RegisterViewListener(
  name: string,
  callback?: () => void,
  sync?: boolean,
): {
  on(event: string, handler: (...args: any[]) => void): void;
};

const HOST = "127.0.0.1";
const FIRST_HOST_PORT = 39871;
const LAST_HOST_PORT = 39890;
const HOST_CHECK_TIMEOUT_MS = 650;

type FlightDeckNativeHealth = {
  status?: string;
  version?: string;
};

type PlannedRouteListener = {
  on(event: string, handler: (...args: any[]) => void): void;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error("timeout")), timeoutMs);
    }),
  ]);
}

class FlightDeckEfbView extends AppView<RequiredProps<AppViewProps, "bus">> {
  private hostUrl: string | null = null;
  private routeListener: PlannedRouteListener | null = null;
  private retryTimer: number | null = null;

  public onAfterRender(): void {
    this.bindNativeRouteListener();
    this.bindSyncButton();
    this.discoverHost();
  }

  public destroy(): void {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    super.destroy();
  }

  private setStatus(label: string, detail: string, state: "waiting" | "ready" | "attention" = "waiting"): void {
    const root = document.querySelector(".flight-deck-efb-surface");
    const status = document.getElementById("flight-deck-native-status");
    const detailElement = document.getElementById("flight-deck-native-detail");
    if (root) root.setAttribute("data-native-status", state);
    if (status) status.textContent = label;
    if (detailElement) detailElement.textContent = detail;
  }

  private bindSyncButton(): void {
    document.getElementById("flight-deck-route-sync-button")?.addEventListener("click", () => {
      this.readAndPublishEfbRoute(true);
    });
  }

  private bindNativeRouteListener(): void {
    try {
      this.routeListener = RegisterViewListener("JS_LISTENER_PLANNEDROUTE", () => {
        this.routeListener?.on("AvionicsRouteSync", (route: unknown) => {
          this.postToHost("/api/native/avionics-sync", { route }).catch(() => undefined);
          this.setStatus("AVIONICS SYNC", "MSFS reports that the EFB route was synchronized to avionics.", "ready");
        });
      }, true);
    } catch {
      this.setStatus("ROUTE LISTENER LIMITED", "MSFS Planned Route listener is not available in this SDK/runtime.", "attention");
    }
  }

  private async discoverHost(): Promise<void> {
    this.setStatus("FINDING HOST", `Checking ${HOST}:${FIRST_HOST_PORT}-${LAST_HOST_PORT} …`, "waiting");
    for (let port = FIRST_HOST_PORT; port <= LAST_HOST_PORT; port += 1) {
      const url = `http://${HOST}:${port}`;
      try {
        const response = await withTimeout(fetch(`${url}/api/native/health`, { cache: "no-store" }), HOST_CHECK_TIMEOUT_MS);
        if (!response.ok) continue;
        const health = await response.json() as FlightDeckNativeHealth;
        if (health.status !== "ok") continue;
        this.hostUrl = url;
        const root = document.querySelector(".flight-deck-efb-surface");
        const frame = document.getElementById("flight-deck-efb-frame") as HTMLIFrameElement | null;
        root?.classList.add("host-ready");
        if (frame) frame.src = `${url}/`;
        this.setStatus("HOST CONNECTED", `Flight Deck EFB ${health.version || ""} · port ${port}`, "ready");
        await this.readAndPublishEfbRoute(false);
        return;
      } catch {
        // Try the next Flight Deck host port.
      }
    }
    this.hostUrl = null;
    document.querySelector(".flight-deck-efb-surface")?.classList.remove("host-ready");
    this.setStatus("HOST OFFLINE", "Start the Windows Flight Deck EFB host; automatic discovery will retry.", "attention");
    this.retryTimer = window.setTimeout(() => this.discoverHost(), 4_000);
  }

  private async postToHost(path: string, body: unknown): Promise<void> {
    if (!this.hostUrl) return;
    const response = await fetch(`${this.hostUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Flight Deck host returned HTTP ${response.status}`);
  }

  private async readAndPublishEfbRoute(userInitiated: boolean): Promise<void> {
    if (!this.hostUrl) {
      if (userInitiated) this.setStatus("HOST OFFLINE", "Start the Windows Flight Deck EFB host first.", "attention");
      return;
    }
    try {
      if (userInitiated) this.setStatus("READING EFB ROUTE", "Reading the current MSFS EFB route …", "waiting");
      // GET_EFB_ROUTE is the documented MSFS 2024 Planned Route read API.
      // Route writes stay in the native MSFS EFB flow; Flight Deck intentionally
      // does not call route-write methods that are not fully documented/stable.
      const route = await Coherent.call("GET_EFB_ROUTE");
      await this.postToHost("/api/native/route", { route });
      this.setStatus("ROUTE COMPARED", "MSFS EFB route sent to Flight Deck for local comparison.", "ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus("ROUTE READ FAILED", message || "MSFS EFB route could not be read.", "attention");
    }
  }

  public render(): VNode {
    return (
      <div class="flight-deck-efb-surface" data-native-status="waiting">
        <div class="flight-deck-native-bridge">
          <div class="flight-deck-native-copy">
            <i></i>
            <span>
              <strong id="flight-deck-native-status">FINDING HOST</strong>
              <small id="flight-deck-native-detail">Connecting to the Windows host …</small>
            </span>
          </div>
          <button id="flight-deck-route-sync-button" type="button">COMPARE EFB ROUTE</button>
        </div>
        <div class="flight-deck-efb-content">
          <iframe
            id="flight-deck-efb-frame"
            class="flight-deck-efb-frame"
            src="about:blank"
            title="Flight Deck EFB"
          />
          <div class="flight-deck-efb-host-hint">
            <strong>Flight Deck EFB host unavailable</strong>
            <span>Start the Windows app and keep its tray icon running.</span>
          </div>
        </div>
      </div>
    );
  }
}

class FlightDeckEfb extends App {
  public get name(): string {
    return "Flight Deck EFB";
  }

  public get icon(): string {
    return `${BASE_URL}/Assets/app-icon.svg`;
  }

  public BootMode = AppBootMode.WARM;
  public SuspendMode = AppSuspendMode.SLEEP;

  public async install(_props: AppInstallProps): Promise<void> {
    Efb.loadCss(`${BASE_URL}/FlightDeckEFB.css`);
    return Promise.resolve();
  }

  public render(): TVNode<FlightDeckEfbView> {
    return <FlightDeckEfbView bus={this.bus} />;
  }
}

Efb.use(FlightDeckEfb);
