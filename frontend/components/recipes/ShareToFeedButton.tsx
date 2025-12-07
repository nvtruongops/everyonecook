/**
 * Share to Feed Button Component
 * Task 17.2 - Connect recipes with social sharing
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ShareToFeedButtonProps {
  recipeId: string;
  recipeTitle: string;
  recipeImage?: string;
  recipeDescription?: string;
}

export default function ShareToFeedButton({
  recipeId,
  recipeTitle,
  recipeImage,
  recipeDescription,
}: ShareToFeedButtonProps) {
  const [isSharing, setIsSharing] = useState(false);
  const router = useRouter();

  const handleShare = () => {
    setIsSharing(true);

    // Store recipe data in sessionStorage to pre-fill post form
    const recipeData = {
      recipe_id: recipeId,
      title: recipeTitle,
      image: recipeImage,
      description: recipeDescription,
    };

    sessionStorage.setItem('share_recipe', JSON.stringify(recipeData));

    // Navigate to dashboard (post creation form will detect the data)
    router.push('/dashboard?share=recipe');
  };

  return (
    <button
      onClick={handleShare}
      disabled={isSharing}
      className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
    >
      <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
        />
      </svg>
      {isSharing ? 'Sharing...' : 'Share to Feed'}
    </button>
  );
}
