import { createHashRouter } from "react-router-dom";
import App from "./App";
import DatasheetScreen from "./screens/DatasheetScreen";
import ExploreScreen from "./screens/ExploreScreen";
import FactionScreen from "./screens/FactionScreen";
import GlanceScreen from "./screens/GlanceScreen";
import ImportScreen from "./screens/ImportScreen";
import ListsScreen from "./screens/ListsScreen";
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
      { path: "explore", element: <ExploreScreen /> },
      { path: "explore/:factionId", element: <FactionScreen /> },
      { path: "explore/:factionId/:unitId", element: <DatasheetScreen /> },
    ],
  },
]);
