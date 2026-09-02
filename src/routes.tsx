import { createHashRouter } from "react-router-dom";
import App from "./App";
import CrunchScreen from "./screens/CrunchScreen";
import DatasheetScreen from "./screens/DatasheetScreen";
import ExploreScreen from "./screens/ExploreScreen";
import FactionScreen from "./screens/FactionScreen";
import GlanceScreen from "./screens/GlanceScreen";
import ImportScreen from "./screens/ImportScreen";
import DatasheetEditScreen from "./screens/DatasheetEditScreen";
import DetachmentEditScreen from "./screens/DetachmentEditScreen";
import DetachmentScreen from "./screens/DetachmentScreen";
import EditorFactionScreen from "./screens/EditorFactionScreen";
import EditorHomeScreen from "./screens/EditorHomeScreen";
import ListEditScreen from "./screens/ListEditScreen";
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
      { path: "unit/:entryKey/crunch", element: <CrunchScreen /> },
      { path: "lists", element: <ListsScreen /> },
      { path: "lists/:listId/edit", element: <ListEditScreen /> },
      { path: "sync-setup", element: <SyncSetupScreen /> },
      { path: "explore", element: <ExploreScreen /> },
      { path: "explore/:factionId", element: <FactionScreen /> },
      { path: "explore/:factionId/detachment/:detId", element: <DetachmentScreen /> },
      { path: "explore/:factionId/:unitId", element: <DatasheetScreen /> },
      { path: "editor", element: <EditorHomeScreen /> },
      { path: "editor/:factionId", element: <EditorFactionScreen /> },
      { path: "editor/:factionId/datasheet/:sheetId", element: <DatasheetEditScreen /> },
      { path: "editor/:factionId/detachment/:detId", element: <DetachmentEditScreen /> },
    ],
  },
]);
