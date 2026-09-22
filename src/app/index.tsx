import { Redirect } from "expo-router";
import { useEffect, useState } from "react";

import { hasSeenOnboarding } from "@/lib/onboarding";

export default function Index() {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    void hasSeenOnboarding().then(setSeen);
  }, []);

  if (seen === null) return null;
  return <Redirect href={seen ? "/(tabs)/home" : "/(tabs)/home/onboarding"} />;
}
