import { G2_LENS_WIDTH, type GrayImage, type UiFont } from "../../graphics/image";
import { appSwitcherPositionSetting, statusBarPositionSetting, type AppSwitcherPosition } from "../../ui/dashboard-settings";
import type { InputEvent } from "../../ui/gestures";
import { MENU_HIGHLIGHT_FILL, MENU_HIGHLIGHT_STROKE } from "../../ui/menu-core";
import { MIN_WINDOW_HEIGHT, SIDEBAR_WIDTH, SWITCHER_ROW_HEIGHT, TOP_BAR_HEIGHT } from "../../ui/shell/geometry";
import { onboardingFont } from "./onboarding-fonts";
import { drawPageHeading, type OnboardingNav, type OnboardingPage } from "./onboarding-page";

const CONTENT_GAP = 10;
const BOTTOM_MARGIN = 8;
/** Diagram width as a fraction of the display's: the most a diagram is drawn at. */
const DIAGRAM_SCALE = 0.4;
/** The real-display area a diagram covers: a 288px window band and a bottom switcher row under it. */
const DIAGRAM_AREA_HEIGHT = MIN_WINDOW_HEIGHT + SWITCHER_ROW_HEIGHT;
/** Padding inside a cell's selection box, round the diagram and its caption. */
const CELL_PADDING = 8;
const CAPTION_GAP = 4;
const COLUMN_GAP = 16;
const ROW_GAP = 6;
const DEPTH_SUBTITLE = "Customizable Depth";
/** Grid order, in rows of two: the layouts with depth on top. */
const LAYOUT_ORDER: readonly AppSwitcherPosition[] = ["bottom", "popup", "left", "right"];
/** Selected on the first visit, and marked. */
const RECOMMENDED_LAYOUT: AppSwitcherPosition = "bottom";

/** Whether a layout leaves the side margins the display's stereo depth shifts into (geometry.ts uiDepth). */
export function layoutHasDepth(position: AppSwitcherPosition): boolean {
  return position === "bottom" || position === "popup";
}

/**
 * The app switcher position, as a 2×2 grid of captioned diagrams of each
 * layout, Bottom (recommended, and selected at first) and Popup on top;
 * swipes move through them in reading order, a tap saves the selected one.
 * The page is fullscreen, so the diagrams get 40% of the display's width
 * each. Choosing a layout reflows open windows (the dashboard controller
 * watches the setting).
 */
export class LayoutPage implements OnboardingPage {
  readonly fullscreen = true;
  /** Kept across visits, so going back returns to the last choice. */
  private selected = LAYOUT_ORDER.indexOf(RECOMMENDED_LAYOUT);

  paint(image: GrayImage, focused: boolean): void {
    const top = drawPageHeading(
      image,
      "Layout",
      "Swipe to choose where the app switcher goes, then tap to continue.",
    ) + CONTENT_GAP;
    const title = onboardingFont("body");
    const subtitle = onboardingFont("detail");
    const captionHeight = CAPTION_GAP + title.lineHeight + subtitle.lineHeight;
    const available = image.height - top - BOTTOM_MARGIN;
    // Short of DIAGRAM_SCALE only where two rows of cells wouldn't fit.
    const scale = Math.min(
      DIAGRAM_SCALE,
      ((available - ROW_GAP) / 2 - 2 * CELL_PADDING - captionHeight) / DIAGRAM_AREA_HEIGHT,
      ((image.width - COLUMN_GAP) / 2 - 2 * CELL_PADDING) / G2_LENS_WIDTH,
    );
    const diagramWidth = Math.round(G2_LENS_WIDTH * scale);
    const diagramHeight = Math.round(DIAGRAM_AREA_HEIGHT * scale);
    const cellWidth = diagramWidth + 2 * CELL_PADDING;
    const cellHeight = diagramHeight + 2 * CELL_PADDING + captionHeight;
    const left = Math.round((image.width - 2 * cellWidth - COLUMN_GAP) / 2);
    const gridTop = top + Math.max(0, Math.round((available - 2 * cellHeight - ROW_GAP) / 2));
    LAYOUT_ORDER.forEach((position, index) => {
      const x = left + (index % 2) * (cellWidth + COLUMN_GAP);
      const y = gridTop + Math.floor(index / 2) * (cellHeight + ROW_GAP);
      const selected = index === this.selected;
      if (selected) {
        if (focused) image.fillRoundedRect(x, y, cellWidth, cellHeight, MENU_HIGHLIGHT_FILL, 8);
        image.drawRoundedRect(x, y, cellWidth, cellHeight, MENU_HIGHLIGHT_STROKE, 8);
      }
      drawLayoutDiagram(new Diagram(image, x + CELL_PADDING, y + CELL_PADDING, scale), position);
      const centre = (text: string, font: UiFont, textY: number, value: number) =>
        image.drawText(font, x + Math.round((cellWidth - font.measureText(text)) / 2), textY, text, value);
      const captionTop = y + CELL_PADDING + diagramHeight + CAPTION_GAP;
      const name = appSwitcherPositionSetting.displayValue(position);
      const caption = position === RECOMMENDED_LAYOUT ? `${name} (Recommended)` : name;
      centre(caption, title, captionTop, selected ? 255 : 190);
      if (layoutHasDepth(position)) {
        centre(DEPTH_SUBTITLE, subtitle, captionTop + title.lineHeight, selected ? 210 : 150);
      }
    });
  }

  handleInput(event: InputEvent, nav: OnboardingNav): void {
    const last = LAYOUT_ORDER.length - 1;
    switch (event.type) {
      case "scroll-up":
        this.selected = Math.max(0, this.selected - 1);
        return;
      case "scroll-down":
        this.selected = Math.min(last, this.selected + 1);
        return;
      case "click":
        appSwitcherPositionSetting.set(LAYOUT_ORDER[this.selected]!);
        nav.next();
        return;
      default:
        return;
    }
  }
}

// Diagram brightnesses: brighter than the real chrome's, which the diagrams
// shrink to a few pixels.
const AREA_OUTLINE = 30;
const CHROME_LINE = 100;
const WINDOW_FRAME = 140;
const ICON = 160;
const SELECTED_ICON = 230;
const STATUS = 140;
const CONTENT = 110;
const CONTENT_TITLE = 170;
/** Window content under a popup switcher, which dims it. */
const DIM = 0.5;

/**
 * Draws in real-display pixels, scaled into a cell: the DIAGRAM_AREA_HEIGHT
 * rows from the diagram's top, or from `top` rows down (see from).
 */
class Diagram {
  constructor(
    private readonly image: GrayImage,
    private readonly x: number,
    private readonly y: number,
    private readonly scale: number,
    private readonly top = 0,
  ) {}

  /** The same diagram with its row 0 `top` rows down. */
  from(top: number): Diagram {
    return new Diagram(this.image, this.x, this.y, this.scale, top);
  }

  private box(x: number, y: number, width: number, height: number) {
    y += this.top;
    const left = this.x + Math.round(x * this.scale), top = this.y + Math.round(y * this.scale);
    return {
      x: left,
      y: top,
      width: Math.max(1, this.x + Math.round((x + width) * this.scale) - left),
      height: Math.max(1, this.y + Math.round((y + height) * this.scale) - top),
    };
  }

  fill(x: number, y: number, width: number, height: number, value: number, radius = 0): void {
    const box = this.box(x, y, width, height);
    if (radius) this.image.fillRoundedRect(box.x, box.y, box.width, box.height, value, Math.max(1, Math.round(radius * this.scale)));
    else this.image.fillRect(box.x, box.y, box.width, box.height, value);
  }

  outline(x: number, y: number, width: number, height: number, value: number, radius = 0): void {
    const box = this.box(x, y, width, height);
    this.image.drawRoundedRect(box.x, box.y, box.width, box.height, value, Math.max(0, Math.round(radius * this.scale)));
  }

  /** A one-pixel line along a real-pixel row (horizontal) or column. */
  hline(x: number, y: number, width: number, value: number): void {
    const box = this.box(x, y, width, 1);
    this.image.fillRect(box.x, box.y, box.width, 1, value);
  }

  vline(x: number, y: number, height: number, value: number): void {
    const box = this.box(x, y, 1, height);
    this.image.fillRect(box.x, box.y, 1, box.height, value);
  }
}

/**
 * A layout as the real chrome lays it out (geometry.ts, chrome-layer.ts),
 * to scale and simplified: the window band with its status bar and frame,
 * and the switcher with a few icons, the first selected. Status bar
 * placement follows the current setting. Only a bottom switcher row takes
 * rows under the band; without one, the band sits centred in their place,
 * as the band and row share the screen's slack.
 */
function drawLayoutDiagram(area: Diagram, position: AppSwitcherPosition): void {
  area.outline(0, 0, G2_LENS_WIDTH, DIAGRAM_AREA_HEIGHT, AREA_OUTLINE, 12);
  const d = position === "bottom" ? area : area.from((DIAGRAM_AREA_HEIGHT - MIN_WINDOW_HEIGHT) / 2);
  const statusAtBottom = statusBarPositionSetting.get() === "bottom";
  const windowLeft = SIDEBAR_WIDTH / 2, windowWidth = G2_LENS_WIDTH - SIDEBAR_WIDTH;
  switch (position) {
    case "left":
    case "right": {
      const stripLeft = position === "left" ? 0 : G2_LENS_WIDTH - SIDEBAR_WIDTH;
      const contentLeft = position === "left" ? SIDEBAR_WIDTH : 0;
      drawStatusBar(d, contentLeft, 0, windowWidth, true);
      drawContent(d, contentLeft, TOP_BAR_HEIGHT, windowWidth, MIN_WINDOW_HEIGHT - TOP_BAR_HEIGHT, 1);
      const separator = position === "left" ? SIDEBAR_WIDTH - 1 : stripLeft;
      d.vline(separator, TOP_BAR_HEIGHT, MIN_WINDOW_HEIGHT - TOP_BAR_HEIGHT, CHROME_LINE);
      // One column of icons against the separator.
      const column = position === "left" ? SIDEBAR_WIDTH - 36 : stripLeft;
      for (let slot = 0; slot < 4; slot++) drawIcon(d, column + 2, TOP_BAR_HEIGHT + 10 + slot * 40, slot === 0);
      return;
    }
    case "bottom": {
      // With the status bar in the row, the window's header is just the frame's top.
      const contentTop = statusAtBottom ? 1 : TOP_BAR_HEIGHT;
      if (!statusAtBottom) drawStatusBar(d, windowLeft, 0, windowWidth, false);
      drawContent(d, windowLeft, contentTop, windowWidth, MIN_WINDOW_HEIGHT - contentTop, 1);
      d.outline(windowLeft - 1, contentTop - 1, windowWidth + 2, MIN_WINDOW_HEIGHT - contentTop + 2, WINDOW_FRAME, 8);
      for (let slot = 0; slot < 4; slot++) drawIcon(d, windowLeft + 1 + slot * 40, MIN_WINDOW_HEIGHT + 2, slot === 0);
      if (statusAtBottom) drawStatusItems(d, windowLeft + windowWidth, MIN_WINDOW_HEIGHT + 4);
      return;
    }
    case "popup": {
      const statusTop = statusAtBottom ? MIN_WINDOW_HEIGHT - TOP_BAR_HEIGHT : 0;
      const contentTop = statusAtBottom ? 1 : TOP_BAR_HEIGHT;
      const contentHeight = MIN_WINDOW_HEIGHT - TOP_BAR_HEIGHT - 1;
      drawStatusBar(d, windowLeft, statusTop, windowWidth, false);
      drawContent(d, windowLeft, contentTop, windowWidth, contentHeight, DIM);
      d.outline(windowLeft - 1, contentTop - 1, windowWidth + 2, contentHeight + 2, WINDOW_FRAME, 8);
      // The popup: a row of icons over the selected window's title, centred on the content.
      const box = { width: 272, height: 98 };
      const boxLeft = (G2_LENS_WIDTH - box.width) / 2;
      const boxTop = contentTop + (contentHeight - box.height) / 2;
      d.fill(boxLeft, boxTop, box.width, box.height, 0);
      d.outline(boxLeft, boxTop, box.width, box.height, WINDOW_FRAME);
      const iconsLeft = boxLeft + (box.width - (3 * 48 - 4)) / 2;
      for (let slot = 0; slot < 3; slot++) drawIcon(d, iconsLeft + slot * 48 + 6, boxTop + 18, slot === 0);
      d.fill(G2_LENS_WIDTH / 2 - 50, boxTop + 70, 100, 12, STATUS, 6);
      return;
    }
  }
}

/** A status bar along a window's top or bottom edge; `divider` draws its line toward the window. */
function drawStatusBar(d: Diagram, x: number, y: number, width: number, divider: boolean): void {
  if (divider) d.hline(x, y + TOP_BAR_HEIGHT - 1, width, CHROME_LINE);
  drawStatusItems(d, x + width, y);
}

/** Notification icons, a battery and the clock, ending at `right`, in a status bar's 28 rows from `top`. */
function drawStatusItems(d: Diagram, right: number, top: number): void {
  d.fill(right - 64, top + 7, 56, 14, STATUS, 4);
  d.outline(right - 108, top + 8, 32, 12, STATUS, 2);
  d.outline(right - 148, top + 4, 20, 20, CHROME_LINE, 4);
  d.outline(right - 176, top + 4, 20, 20, CHROME_LINE, 4);
}

/** A switcher icon (32px); the selected one filled, as the switcher's selection tab is. */
function drawIcon(d: Diagram, x: number, y: number, selected: boolean): void {
  if (selected) d.fill(x, y, 32, 32, SELECTED_ICON, 6);
  else d.outline(x, y, 32, 32, ICON, 6);
}

/** Stand-in window content: a title and list rows, the first selected. */
function drawContent(d: Diagram, x: number, y: number, width: number, height: number, brightness: number): void {
  const rowWidths = [width - 60, 300, 360, 240];
  d.fill(x + 18, y + 14, 150, 18, CONTENT_TITLE * brightness, 6);
  d.outline(x + 8, y + 44, width - 16, 34, CONTENT * brightness, 8);
  for (let row = 0; row < rowWidths.length; row++) {
    const rowTop = y + 52 + row * 44;
    if (rowTop + 18 > y + height) break;
    d.fill(x + 18, rowTop, Math.min(rowWidths[row]!, width - 36), 18, CONTENT * brightness, 6);
  }
}
