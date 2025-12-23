import React, { useState } from 'react';
import { Layout } from './components/Layout/Layout';
import { CalendarView } from './features/calendar/CalendarView';
import { ChoreChart } from './features/chores/ChoreChart';
import { MealPlanner } from './features/meals/MealPlanner';
import { Settings } from './features/settings/Settings';
import { Lists } from './features/lists/Lists';



function App() {
  const [activeTab, setActiveTab] = useState('calendar');

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      <div className="p-8 h-full">
        {/* Main Content Area */}
        {activeTab === 'calendar' && <CalendarView />}

        {activeTab === 'chores' && <ChoreChart />}
        {activeTab === 'meals' && <MealPlanner />}

        {activeTab === 'lists' && <Lists />}
        {activeTab === 'settings' && <Settings />}
      </div>
    </Layout>
  );
}

export default App;
