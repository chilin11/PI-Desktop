import mascotStillDarkUrl from "../assets/home-mascot-still-dark.png";
import mascotStillLightUrl from "../assets/home-mascot-still-light.png";

export function HomeMascotLogo() {
  return (
    <span
      className="home-mascot-logo"
      data-testid="home-mascot-logo"
      aria-hidden="true"
    >
      <img
        className="home-mascot-still home-mascot-dark"
        src={mascotStillDarkUrl}
        alt=""
        width={100}
        height={100}
        draggable={false}
      />
      <img
        className="home-mascot-still home-mascot-light"
        src={mascotStillLightUrl}
        alt=""
        width={100}
        height={100}
        draggable={false}
      />
    </span>
  );
}
