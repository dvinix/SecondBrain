import { createFileRoute } from "@tanstack/react-router";
import { ChatScreen } from "@/components/chat/ChatScreen";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "SecondBrain" },
      {
        name: "description",
        content:
          "Ask questions across your entire knowledge base. Semantic retrieval, grounded answers, and an interactive knowledge graph.",
      },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  return <ChatScreen />;
}
