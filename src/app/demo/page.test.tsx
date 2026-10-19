import { describe, expect, it } from "vitest";
import { fixtureDashboard } from "@/lib/data/fixtures";
import DemoPage from "./page";

describe("demo page", () => {
  it("shows the example data with no actions, so nothing can be saved", () => {
    const element = DemoPage();
    expect(element.props.data).toBe(fixtureDashboard);
    expect(fixtureDashboard.isExample).toBe(true);
    const actionProps = Object.keys(element.props).filter((key) => key !== "data");
    expect(actionProps).toEqual([]);
  });
});
