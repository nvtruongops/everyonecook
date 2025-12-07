'use client';

import React, { useState } from 'react';
import { nutritionRecommendationService } from '@/services/nutritionRecommendationService';
// SVG Icons as components
const ThumbsUp = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2v0a2 2 0 00-2 2v6.5L9 14M7 20l-2-1v-6a2 2 0 012-2h1m0 0V9a2 2 0 012-2h1" />
    </svg>
);

const ThumbsDown = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v5a2 2 0 002 2v0a2 2 0 002-2v-6.5L15 10M17 4l2 1v6a2 2 0 01-2 2h-1m0 0v5a2 2 0 01-2 2h-1" />
    </svg>
);

const MessageSquare = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
);

const Send = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
);

const X = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const CheckCircle = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

interface RecommendationFeedbackProps {
    userId: string;
    recommendationId: string;
    recipeName: string;
    onFeedbackSubmitted?: (action: 'like' | 'dislike', feedback?: string) => void;
}

const RecommendationFeedback: React.FC<RecommendationFeedbackProps> = ({
    userId,
    recommendationId,
    recipeName,
    onFeedbackSubmitted
}) => {
    const [feedbackType, setFeedbackType] = useState<'like' | 'dislike' | null>(null);
    const [showFeedbackForm, setShowFeedbackForm] = useState(false);
    const [feedbackText, setFeedbackText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleFeedbackClick = (type: 'like' | 'dislike') => {
        setFeedbackType(type);
        if (type === 'dislike') {
            setShowFeedbackForm(true);
        } else {
            submitFeedback(type);
        }
    };

    const submitFeedback = async (type: 'like' | 'dislike', feedback?: string) => {
        try {
            setSubmitting(true);

            await nutritionRecommendationService.trackRecommendationInteraction(
                userId,
                recommendationId,
                type === 'like' ? 'view' : 'dismiss',
                feedback
            );

            setSubmitted(true);
            setShowFeedbackForm(false);

            if (onFeedbackSubmitted) {
                onFeedbackSubmitted(type, feedback);
            }

            // Auto-hide after success
            setTimeout(() => {
                setSubmitted(false);
            }, 3000);

        } catch (error) {
            console.error('Submit feedback error:', error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitWithText = () => {
        if (feedbackType) {
            submitFeedback(feedbackType, feedbackText.trim() || undefined);
        }
    };

    const resetFeedback = () => {
        setFeedbackType(null);
        setShowFeedbackForm(false);
        setFeedbackText('');
        setSubmitted(false);
    };

    if (submitted) {
        return (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-2 rounded-md">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Cảm ơn phản hồi của bạn!</span>
            </div>
        );
    }

    if (showFeedbackForm) {
        return (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-900">
                        Tại sao bạn không thích gợi ý này?
                    </h4>
                    <button
                        onClick={resetFeedback}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <p className="text-xs text-gray-600">
                    Phản hồi của bạn giúp chúng tôi cải thiện gợi ý trong tương lai
                </p>

                <div className="space-y-2">
                    <textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="Ví dụ: Tôi không thích món này vì quá cay, hoặc tôi không ăn được hải sản..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        rows={3}
                        maxLength={500}
                    />
                    <div className="text-xs text-gray-500 text-right">
                        {feedbackText.length}/500
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSubmitWithText}
                        disabled={submitting}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                        <Send className="h-3 w-3" />
                        {submitting ? 'Đang gửi...' : 'Gửi phản hồi'}
                    </button>
                    <button
                        onClick={() => submitFeedback('dislike')}
                        disabled={submitting}
                        className="px-3 py-1.5 text-gray-600 hover:text-gray-800 text-sm"
                    >
                        Bỏ qua
                    </button>
                </div>
            </div>
        );
    }

    if (feedbackType) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-md ${feedbackType === 'like'
                ? 'text-green-600 bg-green-50'
                : 'text-red-600 bg-red-50'
                }`}>
                {feedbackType === 'like' ? (
                    <ThumbsUp className="h-4 w-4" />
                ) : (
                    <ThumbsDown className="h-4 w-4" />
                )}
                <span className="text-sm font-medium">
                    {feedbackType === 'like' ? 'Bạn đã thích gợi ý này' : 'Bạn không thích gợi ý này'}
                </span>
                <button
                    onClick={resetFeedback}
                    className="text-gray-400 hover:text-gray-600 ml-auto"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Gợi ý này có hữu ích không?</span>
            <div className="flex items-center gap-1">
                <button
                    onClick={() => handleFeedbackClick('like')}
                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                    title="Thích gợi ý này"
                >
                    <ThumbsUp className="h-4 w-4" />
                </button>
                <button
                    onClick={() => handleFeedbackClick('dislike')}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="Không thích gợi ý này"
                >
                    <ThumbsDown className="h-4 w-4" />
                </button>
                <button
                    onClick={() => setShowFeedbackForm(true)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title="Để lại phản hồi chi tiết"
                >
                    <MessageSquare className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};

export default RecommendationFeedback;
