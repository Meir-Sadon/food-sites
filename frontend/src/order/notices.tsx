/** How a notice about the order in progress weighs on sending it: a block stops the send, a warning does not. */
export type NoticeKind = "block" | "warning" | "info";

export interface OrderNotice {
  id: string;
  kind: NoticeKind;
  text: string;
}

/** What the notices are worked out from. The order page and the "complete the order" dialog share them. */
export interface NoticeInput {
  t: (key: string, options?: Record<string, unknown>) => string;
  submitError: string | null;
  /** Delivery by zones: the state of the fee for the address typed so far. */
  zones: null | {
    quote: "idle" | "loading" | "failed" | "ready";
    status?: string;
    approximate?: boolean;
    /** There are dishes, so the lack of an address is worth a word. */
    hasDishes: boolean;
  };
  noDishes: boolean;
  unadjustedNames: string[];
  belowMinimum: null | { minimum: string; missing: string };
}

/**
 * Every notice, warning and block that holds back or colours the sending of an order, in one list so the form and the
 * dialog that completes missing fields behave the same. A fee still being worked out is a pending state, not a notice.
 */
export function orderNotices(input: NoticeInput): OrderNotice[] {
  const { t, zones } = input;
  const list: OrderNotice[] = [];
  if (input.submitError)
    list.push({ id: "submit", kind: "block", text: input.submitError });
  if (zones) {
    if (zones.quote === "idle") {
      if (zones.hasDishes)
        list.push({
          id: "needAddress",
          kind: "info",
          text: t("order.zones.needAddress"),
        });
    } else if (zones.quote === "ready" && zones.status === "blocked") {
      list.push({
        id: "blocked",
        kind: "block",
        text: t("order.zones.blocked"),
      });
    } else if (
      zones.quote === "failed" ||
      (zones.quote === "ready" && zones.status === "unknown")
    ) {
      list.push({
        id: "unknown",
        kind: "warning",
        text: t("order.zones.unknown"),
      });
    } else if (zones.quote === "ready" && zones.approximate) {
      list.push({
        id: "approximate",
        kind: "warning",
        text: t("order.zones.approximate"),
      });
    }
  }
  if (input.noDishes)
    list.push({ id: "noDishes", kind: "info", text: t("order.chooseDishes") });
  if (input.unadjustedNames.length > 0) {
    list.push({
      id: "unadjusted",
      kind: "warning",
      text: t("order.adjustRequired", {
        names: input.unadjustedNames.join(", "),
      }),
    });
  }
  if (input.belowMinimum)
    list.push({
      id: "belowMinimum",
      kind: "warning",
      text: t("order.belowMinimum", input.belowMinimum),
    });
  return list;
}

/** The "!" shown beside the send button while there is any notice; the button points at the list with aria-describedby. */
export function NoticeMark({ notices }: { notices: OrderNotice[] }) {
  if (notices.length === 0) return null;
  return (
    <span
      className={`notice-mark${notices.some((n) => n.kind === "block") ? " notice-mark--block" : ""}`}
      aria-hidden="true"
    >
      !
    </span>
  );
}

/** The list under the send button. */
export function NoticeList({
  notices,
  id,
}: {
  notices: OrderNotice[];
  id: string;
}) {
  if (notices.length === 0) return null;
  return (
    <ul id={id} className="notice-list">
      {notices.map((n) => (
        <li
          key={n.id}
          role={n.kind === "block" ? "alert" : "status"}
          className={`notice-list__item notice-list__item--${n.kind}${n.kind === 'block' ? ' form-error' : ''}`}
        >
          {n.text}
        </li>
      ))}
    </ul>
  );
}
