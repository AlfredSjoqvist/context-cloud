"use client";

import React from "react";
import { ConvexProvider } from "convex/react";
import { convex } from "../lib/convex";
import { EventStream } from "../components/EventStream";

export default function Page(): React.JSX.Element {
  return (
    <ConvexProvider client={convex}>
      <EventStream />
    </ConvexProvider>
  );
}
