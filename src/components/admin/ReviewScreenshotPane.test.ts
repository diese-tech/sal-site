import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewScreenshotPane } from "@/components/admin/ReviewScreenshotPane";

function render(props: Parameters<typeof ReviewScreenshotPane>[0]) {
  return renderToStaticMarkup(createElement(ReviewScreenshotPane, props));
}

const urls = ["https://cdn.example/g1.png", "https://cdn.example/g2.png"];

describe("ReviewScreenshotPane", () => {
  it("explains the manual-entry case instead of rendering a broken image", () => {
    const html = render({ urls: [], activeIndex: 0, onSelect: () => {} });
    expect(html).toContain("No screenshot uploaded");
    expect(html).not.toContain("<img");
  });

  it("shows the screenshot for the active game", () => {
    const html = render({ urls, activeIndex: 1, onSelect: () => {} });
    expect(html).toContain('src="https://cdn.example/g2.png"');
    expect(html).toContain("2 / 2");
  });

  it("renders a thumbnail per screenshot so the host can switch games", () => {
    const html = render({ urls, activeIndex: 0, onSelect: () => {} });
    expect(html).toContain("G1");
    expect(html).toContain("G2");
  });

  it("omits the counter and thumbnails for a single screenshot", () => {
    const html = render({ urls: [urls[0]], activeIndex: 0, onSelect: () => {} });
    expect(html).toContain('src="https://cdn.example/g1.png"');
    expect(html).not.toContain("G1");
  });

  it("clamps an activeIndex past the end rather than rendering nothing", () => {
    // Games can outnumber screenshots — a Bo5 reported with 3 images, or a game
    // added by hand during review.
    const html = render({ urls, activeIndex: 7, onSelect: () => {} });
    expect(html).toContain('src="https://cdn.example/g2.png"');
  });

  it("links out to the full-size original", () => {
    const html = render({ urls, activeIndex: 0, onSelect: () => {} });
    expect(html).toContain('href="https://cdn.example/g1.png"');
  });
});
