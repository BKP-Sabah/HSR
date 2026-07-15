import { getChatGPTUser } from "./chatgpt-auth";
import DashboardApp from "./dashboard-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return <DashboardApp displayName={user?.displayName ?? "Penyelaras HSR Negeri"} />;
}
