import { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, HttpError } from "@/lib/http";
import { privateApi, privateBody } from "@/lib/private/http";
import { withPrivateState } from "@/lib/private/store";
import { authenticatedUser } from "@/lib/private/auth";
import { overview } from "@/lib/private/ledger";
import { recordActivity } from "@/lib/private/activity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: NextRequest) {
  return privateApi(async () => {
    assertSameOrigin(request);
    const input = await privateBody(
      request,
      z.object({ key: z.string().min(1).max(300), reviewRequested: z.boolean() }).strict(),
    );
    return withPrivateState((s) => {
      const user = authenticatedUser(s, request),
        subscription = overview(s, request).subscriptions.find((x) => x.key === input.key);
      if (!subscription) throw new HttpError(404, "Subscription not found.");
      user.subscriptionReviews = (user.subscriptionReviews || []).filter(
        (key) => key !== input.key,
      );
      if (input.reviewRequested) user.subscriptionReviews.push(input.key);
      recordActivity(
        s,
        user.id,
        input.reviewRequested ? "Subscription flagged for review" : "Subscription review cleared",
        subscription.name,
        "planning",
      );
      return { reviewRequested: input.reviewRequested };
    });
  });
}
