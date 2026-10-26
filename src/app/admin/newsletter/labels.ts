export const EVENT_LABELS: Record<string, string> = {
  signup: "Signed up",
  signup_repeat: "Signed up again",
  resubscribe_requested: "Asked to resubscribe",
  confirm_sent: "Confirmation sent",
  confirmed: "Confirmed",
  resubscribed: "Resubscribed",
  welcome_sent: "Welcome sent",
  already_subscribed_sent: "Already-subscribed note",
  unsubscribed: "Unsubscribed",
  preferences: "Preferences",
  sent: "Newsletter sent",
  delivered: "Delivered",
  bounced: "Bounced",
  complained: "Complaint",
  opened: "Opened",
  clicked: "Clicked",
};

export const SUB_STATUSES = ["ACTIVE", "PENDING", "UNSUBSCRIBED", "BOUNCED", "COMPLAINED"] as const;
