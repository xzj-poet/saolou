import { describe,expect,it } from "vitest";
import { selectionTitle,toggleRoomSelection } from "@/modules/sweep/agent/batch-selection";
describe("batch selection",()=>{it("toggles unique rooms and renders concrete room numbers",()=>{expect(toggleRoomSelection(["101"],"102")).toEqual(["101","102"]);expect(toggleRoomSelection(["101","102"],"101")).toEqual(["102"]);expect(selectionTitle(["102","101"])).toBe("标记 101、102");expect(selectionTitle([])).toBe("标记宿舍");});});
