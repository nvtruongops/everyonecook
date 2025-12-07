'use client';

import React, { useState } from 'react';
import { RecipeGroupsOverview, RecipeGroupDetail } from '../../components/recipes';

export default function RecipeGroupsPage() {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const handleGroupSelect = (groupId: string) => {
    setSelectedGroupId(groupId);
  };

  const handleBackToOverview = () => {
    setSelectedGroupId(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {selectedGroupId ? (
        <RecipeGroupDetail
          groupId={selectedGroupId}
          onBack={handleBackToOverview}
        />
      ) : (
        <RecipeGroupsOverview
          onGroupSelect={handleGroupSelect}
        />
      )}
    </div>
  );
}
