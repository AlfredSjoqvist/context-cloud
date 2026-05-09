"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Providers({ children }: { children: ReactNode }) {
    if (!client) {
        return (
            <div style={{ padding: 32, fontFamily: "monospace", color: "#FFB86B" }}>
                NEXT_PUBLIC_CONVEX_URL is not set. Copy <code>.env.example</code> to{" "}
                <code>.env.local</code> and fill it in.
            </div>
        );
    }
    return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
