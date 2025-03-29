import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useChatStore } from "~/lib/store";

export default function Index() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    createChat,
    setCurrentChat,
    setCurrentCrew,
    currentCrewId,
    currentChatId,
  } = useChatStore();

  useEffect(() => {
    try {
      const crewId = searchParams.get("crew") || currentCrewId;

      const chatId = searchParams.get("chatId") || currentChatId;

      createChat(chatId, crewId);
      setCurrentChat(chatId);
      setCurrentCrew(crewId);

      navigate(`/chat/${chatId}${crewId ? `?crew=${crewId}` : ""}`);
    } catch (error) {
      console.error("Error creating new chat:", error);

      navigate("/");
    }
  }, [
    navigate,
    createChat,
    setCurrentChat,
    setCurrentCrew,
    currentCrewId,
    searchParams,
  ]);

  return null;
}
