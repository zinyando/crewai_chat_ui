import type { Route } from "./+types/home";
import ChatLayout from "./chat";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "CrewAI Chat UI" },
    { name: "description", content: "Welcome to CrewAI Chat UI" },
  ];
}

export default function Home() {
  return <ChatLayout />;
}
