import type { SegmentDefinition } from "./types.ts";

// Mock user-session archetypes for a consumer booking funnel (travel /
// e-commerce style: browse -> search -> compare -> booking_attempt ->
// complete). Continuation rates are the deterministic baseline used to
// synthesize the funnel drop-off per segment; they are illustrative mock
// values, not measured data.
export const SEGMENTS: SegmentDefinition[] = [
  {
    id: "price_sensitive_browser",
    name_key: "segment.price_sensitive_browser.name",
    description_key: "segment.price_sensitive_browser.description",
    continuation_rates: [0.62, 0.5, 0.32, 0.55],
    session_length_range: [2, 9],
    cart_abandon_range: [1, 4],
    price_check_range: [4, 12],
    days_since_last_visit_range: [0, 3],
    coupon_click_range: [1, 5],
    session_count: 60,
  },
  {
    id: "repeat_traveler",
    name_key: "segment.repeat_traveler.name",
    description_key: "segment.repeat_traveler.description",
    continuation_rates: [0.8, 0.72, 0.68, 0.82],
    session_length_range: [4, 14],
    cart_abandon_range: [0, 2],
    price_check_range: [1, 4],
    days_since_last_visit_range: [10, 60],
    coupon_click_range: [0, 1],
    session_count: 55,
  },
  {
    id: "last_minute_booker",
    name_key: "segment.last_minute_booker.name",
    description_key: "segment.last_minute_booker.description",
    continuation_rates: [0.7, 0.66, 0.6, 0.74],
    session_length_range: [1, 5],
    cart_abandon_range: [0, 2],
    price_check_range: [1, 3],
    days_since_last_visit_range: [0, 1],
    coupon_click_range: [0, 1],
    session_count: 45,
  },
  {
    id: "deal_hunter",
    name_key: "segment.deal_hunter.name",
    description_key: "segment.deal_hunter.description",
    continuation_rates: [0.58, 0.46, 0.28, 0.4],
    session_length_range: [3, 11],
    cart_abandon_range: [2, 6],
    price_check_range: [6, 16],
    days_since_last_visit_range: [1, 5],
    coupon_click_range: [3, 9],
    session_count: 50,
  },
  {
    id: "high_intent_planner",
    name_key: "segment.high_intent_planner.name",
    description_key: "segment.high_intent_planner.description",
    continuation_rates: [0.85, 0.78, 0.74, 0.88],
    session_length_range: [6, 18],
    cart_abandon_range: [0, 1],
    price_check_range: [2, 5],
    days_since_last_visit_range: [2, 20],
    coupon_click_range: [0, 2],
    session_count: 40,
  },
];

export function segmentById(id: string): SegmentDefinition | undefined {
  return SEGMENTS.find((segment) => segment.id === id);
}
