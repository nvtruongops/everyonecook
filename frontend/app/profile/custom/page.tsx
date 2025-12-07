'use client';
import { useAuth } from '@/contexts/AuthContext';
import CustomProfileManager from '@/components/profile/CustomProfileManager';
import { CustomProfile } from '@/types/profile';

export default function CustomProfilePage() {
  const { user } = useAuth();

  if (!user)
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#203d11] mb-4">Vui lòng đăng nhập</h1>
          <p className="text-[#203d11]/70">Bạn cần đăng nhập để quản lý hồ sơ tùy chỉnh.</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white py-8">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#203d11]">Hồ sơ tùy chỉnh</h1>
          <p className="mt-2 text-[#203d11]/70">
            Cá nhân hóa hồ sơ với các mục tùy chỉnh để AI gợi ý công thức tốt hơn.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-[#203d11]/5">
          <CustomProfileManager
            userId={user.sub}
            maxSections={5}
            maxTotalFields={15}
            onProfileUpdate={(profile: CustomProfile) => console.log('Profile updated:', profile)}
          />
        </div>

        <div className="mt-8 bg-[#975b1d]/5 border border-[#975b1d]/20 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-[#975b1d] mb-3">💡 Mẹo để AI gợi ý tốt hơn</h2>
          <ul className="space-y-2 text-[#975b1d]/80">
            <li>• Thêm sở thích nấu ăn như ẩm thực yêu thích, chế độ ăn uống</li>
            <li>• Đề cập đến thiết bị nhà bếp bạn có</li>
            <li>• Chia sẻ nền văn hóa hoặc sở thích ẩm thực vùng miền</li>
            <li>• Đặt mức độ riêng tư phù hợp với bạn</li>
          </ul>
        </div>

        <div className="mt-6 bg-[#203d11]/5 border border-[#203d11]/20 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-[#203d11] mb-3">📝 Ví dụ các trường tùy chỉnh</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-[#203d11] mb-2">Sở thích nấu ăn</h3>
              <ul className="text-sm text-[#203d11]/70 space-y-1">
                <li>
                  • <strong>Ẩm thực yêu thích:</strong> "Việt Nam và Thái Lan"
                </li>
                <li>
                  • <strong>Độ cay:</strong> "Thích ăn rất cay"
                </li>
                <li>
                  • <strong>Phong cách:</strong> "Truyền thống kết hợp hiện đại"
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-[#203d11] mb-2">Đặc điểm cá nhân</h3>
              <ul className="text-sm text-[#203d11]/70 space-y-1">
                <li>
                  • <strong>Triết lý ẩm thực:</strong> "Ăn uống lành mạnh"
                </li>
                <li>
                  • <strong>Thiết bị:</strong> "Nồi chiên không dầu, nồi cơm điện"
                </li>
                <li>
                  • <strong>Thời gian:</strong> "Món nhanh ngày thường, cầu kỳ cuối tuần"
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
