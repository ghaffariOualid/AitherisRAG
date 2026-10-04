import React from 'react';
import NavBar from './shared/navBar';
import GeneralChat from './GeneralChat/GeneralChat';

function GeneralChatPage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <NavBar />
      <main className="min-h-0 flex-1 h-full">
        <GeneralChat />
      </main>
    </div>
  );
}

export default GeneralChatPage;
