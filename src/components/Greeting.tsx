"use client";

import { useSyncExternalStore } from "react";
import { greetingForHour } from "@/lib/greeting";

const subscribe = () => () => {};
const clientGreeting = () => greetingForHour(new Date().getHours());
const serverGreeting = () => "Hello";

/** Greets by the visitor's own clock. The server cannot know it, so it renders a plain "Hello". */
export function Greeting({ name }: { name: string }) {
  const greeting = useSyncExternalStore(subscribe, clientGreeting, serverGreeting);
  return (
    <>
      {greeting}, {name}
    </>
  );
}
