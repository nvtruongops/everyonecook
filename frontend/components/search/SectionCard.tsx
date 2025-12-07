'use client';

import { useState } from 'react';
import { Post } from '@/services/search';
import PostCard from '../posts/PostCard';

interface SectionCardProps {
    icon: string;
    title: string;
    count: number;
    section: 'my' | 'friends' | 'public';
    ingredients: string[];
    sortBy: 'date' | 'likes' | 'comments';
    onLoadPosts: (section: string, page: number) => Promise<void>;
}

export default function SectionCard({
    icon,
    title,
    count,
    section,
    ingredients,
    sortBy,
    onLoadPosts
}: SectionCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [posts, setPosts] = useState<Post[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(false);

    async function handleExpand() {
        if (isExpanded) {
            setIsExpanded(false);
            return;
        }

        setIsExpanded(true);
        setLoading(true);

        try {
            await onLoadPosts(section, 1);
        } catch (error) {
            console.error('Failed to load posts:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handlePageChange(page: number) {
        setLoading(true);
        try {
            await onLoadPosts(section, page);
            setCurrentPage(page);
        } catch (error) {
            console.error('Failed to load page:', error);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="border rounded-lg mb-4">
            {/* Header */}
            <div
                className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50"
                onClick={handleExpand}
            >
                <span className="font-medium">
                    {icon} {title} ({count})
                </span>
                <button className="text-blue-600 hover:text-blue-800">
                    {isExpanded ? 'Đóng' : 'Xem >'}
                </button>
            </div>

            {/* Content */}
            {isExpanded && (
                <div className="border-t p-4">
                    {loading ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-600">Đang tải...</p>
                        </div>
                    ) : posts.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">Không có món ăn nào</p>
                    ) : (
                        <>
                            {/* Posts */}
                            <div className="space-y-4">
                                {posts.map(post => (
                                    <PostCard key={post.postId} post={post} />
                                ))}
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex justify-center items-center gap-2 mt-6">
                                    <button
                                        onClick={() => handlePageChange(currentPage - 1)}
                                        disabled={currentPage === 1}
                                        className="px-4 py-2 border rounded disabled:opacity-50"
                                    >
                                        ← Trước
                                    </button>

                                    <span className="px-4">
                                        Trang {currentPage} / {totalPages}
                                    </span>

                                    <button
                                        onClick={() => handlePageChange(currentPage + 1)}
                                        disabled={currentPage === totalPages}
                                        className="px-4 py-2 border rounded disabled:opacity-50"
                                    >
                                        Sau →
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

