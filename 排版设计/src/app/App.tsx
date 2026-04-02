import { WechatArticle } from "./components/WechatArticle";
import { EducationArticle } from "./components/EducationArticle";
import { TravelArticle } from "./components/TravelArticle";
import { EmotionArticle } from "./components/EmotionArticle";
import { FunnyArticle } from "./components/FunnyArticle";
import { CarArticle } from "./components/CarArticle";
import { useState } from "react";

export default function App() {
  const [activeTheme, setActiveTheme] = useState<'ai' | 'education' | 'travel' | 'emotion' | 'funny' | 'car'>('ai');

  const themes = [
    { id: 'ai' as const, name: 'AI科技', icon: '🤖', color: 'from-[#4a90e2] to-[#7b68ee]' },
    { id: 'education' as const, name: '教育学习', icon: '📚', color: 'from-[#ff9a56] to-[#ff6b6b]' },
    { id: 'travel' as const, name: '旅游攻略', icon: '✈️', color: 'from-[#38bdf8] to-[#0ea5e9]' },
    { id: 'emotion' as const, name: '情感治愈', icon: '💕', color: 'from-[#fda4af] to-[#fb7185]' },
    { id: 'funny' as const, name: '搞笑娱乐', icon: '😂', color: 'from-[#ffd93d] to-[#ff6b6b]' },
    { id: 'car' as const, name: '汽车评测', icon: '🚗', color: 'from-[#1e40af] to-[#dc2626]' }
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* 主题切换导航 */}
      <div className="sticky top-0 z-50 bg-white shadow-md">
        <div className="max-w-[750px] mx-auto px-4 py-4">
          <h1 className="text-[20px] font-bold text-center mb-4 text-[#1a1a1a]">
            微信公众号排版设计展示
          </h1>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {themes.map(theme => (
              <button
                key={theme.id}
                onClick={() => setActiveTheme(theme.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-full font-medium text-[14px] transition-all ${
                  activeTheme === theme.id
                    ? `bg-gradient-to-r ${theme.color} text-white shadow-lg scale-105`
                    : 'bg-[#f5f5f5] text-[#666] hover:bg-[#e5e5e5]'
                }`}
              >
                <span className="mr-1">{theme.icon}</span>
                {theme.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 文章内容区 */}
      <div className="py-8">
        {activeTheme === 'ai' && <WechatArticle />}
        {activeTheme === 'education' && <EducationArticle />}
        {activeTheme === 'travel' && <TravelArticle />}
        {activeTheme === 'emotion' && <EmotionArticle />}
        {activeTheme === 'funny' && <FunnyArticle />}
        {activeTheme === 'car' && <CarArticle />}
      </div>
    </div>
  );
}