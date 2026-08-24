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

// The desktop host deliberately remains the only process that talks to
// SimConnect and stores credentials. The EFB surface pairs like any tablet.
const HOST_URL = "http://127.0.0.1:39871/";

class FlightDeckEfbView extends AppView<RequiredProps<AppViewProps, "bus">> {
  public render(): VNode {
    return (
      <div class="flight-deck-efb-surface">
        <iframe
          class="flight-deck-efb-frame"
          src={HOST_URL}
          title="Flight Deck EFB"
        />
        <div class="flight-deck-efb-host-hint">
          <strong>Flight Deck EFB host unavailable</strong>
          <span>Start the Windows app and keep its tray icon running.</span>
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
