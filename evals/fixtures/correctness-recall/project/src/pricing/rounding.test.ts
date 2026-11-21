import { expect, test } from "vitest";
import { roundHalfDown } from "./rounding";

test("exact halves round down so the customer is never charged the odd cent", () => {
  expect(roundHalfDown(2.5)).toBe(2);
  expect(roundHalfDown(2.51)).toBe(3);
  expect(roundHalfDown(2.49)).toBe(2);
});
