import { bonesOf, sceneOf } from "@/lib/pose";
import { timelineFor, type Motion } from "@/lib/timeline";
import { GROUND_AT_REST, placeGround } from "@/lib/planting";
import type { MotionParams } from "@/lib/motionParams";
import { useAtmosphereStore, type Side } from "@/store/useAtmosphereStore";

/**
 * Phases of the motion a strip is made of.
 *
 * Enough that the shape of the cycle is readable -- a walk's two contacts and
 * the passing poses between them -- and few enough that each frame is still
 * large enough to see a limb in. Six is two per authored pose of a four-pose
 * cycle, so nothing lands only on the keyframes.
 */
const FRAMES = 6;
/** Head-on, and the angle animators check a pose from, where depth is visible. */
const VIEWS = [0, 55];
/**
 * How the frames are laid out, and how large each one is.
 *
 * In a row, which is how an animator pins thumbnails up, six frames make an
 * image six times wider than it is tall -- and Jev refuses that outright
 * ("Invalid image dimensions"). Three across and two down keeps it close to
 * square, which it accepts, and is the same sheet with the row wrapped.
 */
const COLUMNS = 3;
/** Side of one frame in the finished sheet. */
const CELL = 300;

const LABEL_FONT = "600 22px ui-sans-serif, system-ui, sans-serif";

/** The instants of the animation a strip samples. */
export function stripTimes(animation: Motion, cycle: number, frames = FRAMES) {
  const span = animation.loop ? cycle : (animation.duration ?? cycle);
  // A cycle's last frame flows back into its first, so sampling it would repeat
  // the first; a one-off ends on its final pose, which must be in the picture.
  return Array.from({ length: frames }, (_, i) =>
    animation.loop ? (i * span) / frames : (i * span) / (frames - 1)
  );
}

/** Loads a data URL into something a canvas can draw. */
function load(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read a captured frame."));
    image.src = url;
  });
}

/**
 * Lays frames out as a numbered sheet, reading left to right then down.
 *
 * The numbers are there because the order is the whole point: a judge has to
 * know which way time runs to tell a step forward from a step back.
 */
async function compose(frames: string[]) {
  const images = await Promise.all(frames.map(load));
  const columns = Math.min(COLUMNS, images.length);
  const rows = Math.ceil(images.length / columns);
  const canvas = document.createElement("canvas");
  canvas.width = CELL * columns;
  canvas.height = CELL * rows;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  images.forEach((image, i) => {
    const x = (i % columns) * CELL;
    const y = Math.floor(i / columns) * CELL;
    ctx.drawImage(image, x, y, CELL, CELL);
    ctx.fillStyle = "#b3b3af";
    if (x > 0) ctx.fillRect(x, y, 1, CELL);
    if (y > 0) ctx.fillRect(x, y, CELL, 1);
    ctx.font = LABEL_FONT;
    ctx.fillStyle = "#282828";
    ctx.fillText(String(i + 1), x + 12, y + 32);
  });
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Renders a whole animation as strips of frames, one per camera angle.
 *
 * This is how a judge that only sees pictures can be asked about motion. A
 * single pose tells you nothing about weight or timing; six frames of one, laid
 * out in order from a frame that is held still, show the body rise and fall,
 * the limbs trail, and the feet pass each other.
 *
 * The model is driven through the real timeline, so what is judged is the
 * motion that will play, and is left in whatever pose the last frame used --
 * the caller is expected to restore it.
 */
export async function captureStrip(args: {
  animation: Motion;
  params: MotionParams;
  side?: Side;
  frames?: number;
}): Promise<string[]> {
  const { animation, params, side = "initial", frames = FRAMES } = args;
  const { viewport } = useAtmosphereStore.getState();
  const scene = sceneOf(side);
  const bones = bonesOf(side);
  if (!viewport || !scene || bones.length === 0) throw new Error("Load a model first.");

  const timeline = timelineFor(animation, scene, bones, params);
  const times = stripTimes(animation, timeline.cycle, frames);

  // Grounding moves the model, and the frame has to be measured where it ends up.
  const held = scene.position.clone();
  viewport.clearFrames();
  try {
    // Once over the motion to find a frame that holds all of it, then again to
    // take the shots. Posing the rig is cheap; the framing has to come first.
    for (const time of times) {
      timeline.pose(time);
      for (const yaw of VIEWS) viewport.lockFrame(side, yaw);
    }

    const shots: string[][] = VIEWS.map(() => []);
    for (const time of times) {
      timeline.pose(time);
      for (let v = 0; v < VIEWS.length; v++) {
        shots[v].push(await viewport.capture(side, VIEWS[v]));
      }
    }
    return await Promise.all(shots.map(compose));
  } finally {
    viewport.clearFrames();
    placeGround(GROUND_AT_REST);
    scene.position.copy(held);
    scene.updateMatrixWorld(true);
  }
}

/** Internals reached by the numeric checks; not part of the module's own surface. */
export const __testing = { FRAMES, VIEWS, COLUMNS };
