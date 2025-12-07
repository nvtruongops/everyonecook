/**
 * Share Cooking Session Component
 * Task 17.3 - Add share button for completed cooking sessions
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ShareCookingSessionProps {
  sessionId: string;
  recipeId: string;
  recipeTitle: string;
  rating?: number;
  notes?: string;
  imageUrl?: string;
  autoSuggest?: boolean; // Auto-suggest if rating >= 4
}

export default function ShareCookingSession({
  sessionId,
  recipeId,
  recipeTitle,
  rating,
  notes,
  imageUrl,
  autoSuggest = false,
}: ShareCookingSessionProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [showSuggestion, setShowSuggestion] = useState(autoSuggest && rating && rating >= 4);
  const router = useRouter();

  const handleShare = () => {
    setIsSharing(true);

    // Prepare cooking session data for sharing
    const sessionData = {
      session_id: sessionId,
      recipe_id: recipeId,
      recipe_title: recipeTitle,
      rating: rating,
      notes: notes,
      image: imageUrl,
    };

    // Store in sessionStorage
    sessionStorage.setItem('share_cooking_session', JSON.stringify(sessionData));

    // Navigate to dashboard
    router.push('/dashboard?share=cooking');
  };

  const handleDismiss = () => {
    setShowSuggestion(false);
  };

  // Auto-suggestion banner (shows when rating >= 4 stars)
  if (showSuggestion) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4 mb-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="w-6 h-6 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-blue-900">
              Great rating! Share your cooking experience?
            </h3>
            <p className="mt-1 text-sm text-blue-700">
              You gave &quot;{recipeTitle}&quot; {rating} stars. Your friends would love to know
              about this!
            </p>
            <div className="mt-3 flex gap-3">
              <button
                onClick={handleShare}
                disabled={isSharing}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
                {isSharing ? 'Sharing...' : 'Share to Feed'}
              </button>
              <button
                onClick={handleDismiss}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Maybe Later
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="ml-3 flex-shrink-0 text-blue-400 hover:text-blue-600"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Regular share button
  return (
    <button
      onClick={handleShare}
      disabled={isSharing}
      className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
    >
      <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
        />
      </svg>
      {isSharing ? 'Sharing...' : 'Share'}
    </button>
  );
}
