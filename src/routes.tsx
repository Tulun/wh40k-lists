import { createHashRouter } from "react-router-dom";
import App from "./App";
import DatasheetScreen from "./screens/DatasheetScreen";
import ExploreScreen from "./screens/ExploreScreen";
import FactionScreen from "./screens/FactionScreen";
import GlanceScreen from "./screens/GlanceScreen";
import ImportScreen from "./screens/ImportScreen";
import DatasheetEditScreen from "./screens/DatasheetEditScreen";
import DetachmentEditScreen from "./screens/DetachmentEditScreen";
import EditorFactionScreen from "./screens/EditorFactionScreen";
import EditorHomeScreen from "./screens/EditorHomeScreen";
import ListsScreen from "./screens/ListsScreen";
import SyncSetupScreen from "./screens/SyncSetupScreen";
import UnitDetailScreen from "./screens/UnitDetailScreen";

export const router = createHashRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <GlanceScreen /> },
      { path: "import", element: <ImportScreen /> },
      { path: "unit/:entryKey", element: <UnitDetailScreen /> },
      { path: "lists", element: <ListsScreen /> },
      { path: "sync-setup", element: <SyncSetupScreen /> },
      { path: "explore", element: <ExploreScreen /> },
      { path: "explore/:factionId", element: <FactionScreen /> },
      { path: "explore/:factionId/:unitId", element: <DatasheetScreen /> },
      { path: "editor", element: <EditorHomeScreen /> },
      { path: "editor/:factionId", element: <EditorFactionScreen /> },
      { path: "editor/:factionId/datasheet/:sheetId", element: <DatasheetEditScreen /> },
      { path: "editor/:factionId/detachment/:detId", element: <DetachmentEditScreen /> },
    ],
  },
]);
