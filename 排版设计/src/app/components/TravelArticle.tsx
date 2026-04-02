import { MapPin, Clock, Eye, Camera, Plane, Navigation, Sun } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

export function TravelArticle() {
  return (
    <div className="max-w-[750px] mx-auto bg-white shadow-lg">
      <article className="px-6 pt-8 pb-6">
        {/* 标题 */}
        <h1 className="text-[28px] font-bold leading-[1.4] mb-4 text-[#1e3a5f]">
          云南大理慢生活指南｜逃离城市喧嚣的7天治愈之旅
        </h1>

        {/* 元信息 */}
        <div className="flex items-center justify-between py-4 border-b border-[#e5e5e5] mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#38bdf8] to-[#0ea5e9] flex items-center justify-center text-white">
              <Plane className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[15px] font-medium text-[#1e3a5f]">漫游者日记</div>
              <div className="flex items-center gap-4 text-[13px] text-[#888]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  2026-03-28
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  38.2k
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 旅行信息卡 */}
        <div className="bg-gradient-to-r from-[#e0f2fe] to-[#dbeafe] p-5 rounded-2xl mb-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[20px] font-bold text-[#0284c7]">7天</div>
              <div className="text-[12px] text-[#64748b] mt-1">行程天数</div>
            </div>
            <div>
              <div className="text-[20px] font-bold text-[#0284c7]">¥3500</div>
              <div className="text-[12px] text-[#64748b] mt-1">人均预算</div>
            </div>
            <div>
              <div className="text-[20px] font-bold text-[#0284c7]">3-5月</div>
              <div className="text-[12px] text-[#64748b] mt-1">最佳时节</div>
            </div>
          </div>
        </div>

        {/* 主图 */}
        <div className="mb-3 rounded-2xl overflow-hidden">
          <ImageWithFallback 
            src="https://images.unsplash.com/photo-1634741426773-1c110c1a0ec7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiZWF1dGlmdWwlMjBiZWFjaCUyMHN1bnNldCUyMHRyYXZlbHxlbnwxfHx8fDE3NzUwNDMzNTV8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Beautiful Sunset"
            className="w-full h-auto"
          />
        </div>
        <p className="text-center text-[13px] text-[#888] mb-8 flex items-center justify-center gap-1">
          <Camera className="w-3.5 h-3.5" />
          洱海日落时分
        </p>

        {/* 行程安排 */}
        <section className="mb-8">
          <h2 className="text-[22px] font-bold text-[#1e3a5f] mb-5 flex items-center gap-2">
            <Navigation className="w-6 h-6 text-[#38bdf8]" />
            精华行程安排
          </h2>

          <div className="space-y-4">
            {/* Day 1 */}
            <div className="relative">
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#38bdf8] to-[#0ea5e9] flex items-center justify-center text-white font-bold flex-shrink-0">
                    D1
                  </div>
                  <div className="w-0.5 h-full bg-gradient-to-b from-[#38bdf8] to-transparent mt-2"></div>
                </div>
                <div className="flex-1 pb-6">
                  <h3 className="text-[17px] font-bold text-[#1e3a5f] mb-2">初到大理 · 古城漫步</h3>
                  <div className="flex items-center gap-2 text-[13px] text-[#64748b] mb-3">
                    <MapPin className="w-4 h-4" />
                    <span>大理古城 → 人民路 → 洋人街</span>
                  </div>
                  <p className="text-[15px] leading-[1.7] text-[#666] mb-3">
                    下午抵达大理，先到客栈办理入住，然后去古城逛逛。推荐沿着人民路慢慢走，这里有很多小众咖啡馆和手工艺品店。
                  </p>
                  <div className="bg-[#f0f9ff] p-3 rounded-lg border-l-4 border-[#38bdf8]">
                    <p className="text-[14px] text-[#0284c7]">
                      <strong>美食推荐：</strong>再回首凉鸡米线、88号西点店
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Day 2-3 */}
            <div className="relative">
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0ea5e9] to-[#0284c7] flex items-center justify-center text-white font-bold text-[14px] flex-shrink-0">
                    D2-3
                  </div>
                  <div className="w-0.5 h-full bg-gradient-to-b from-[#0ea5e9] to-transparent mt-2"></div>
                </div>
                <div className="flex-1 pb-6">
                  <h3 className="text-[17px] font-bold text-[#1e3a5f] mb-2">环洱海骑行 · 风花雪月</h3>
                  <div className="flex items-center gap-2 text-[13px] text-[#64748b] mb-3">
                    <MapPin className="w-4 h-4" />
                    <span>双廊 → 海东 → 小普陀 → 喜洲</span>
                  </div>
                  <p className="text-[15px] leading-[1.7] text-[#666] mb-3">
                    租一辆电动车，来一场说走就走的环海之旅。在双廊看日出，在海东拍照打卡，在喜洲品尝白族特色美食。
                  </p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-[#f8fafc] p-3 rounded-lg">
                      <p className="text-[13px] text-[#475569]">🚲 租车费用：60-80元/天</p>
                    </div>
                    <div className="bg-[#f8fafc] p-3 rounded-lg">
                      <p className="text-[13px] text-[#475569]">⏰ 建议时长：2天慢游</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Day 4-5 */}
            <div className="relative">
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#06b6d4] to-[#0891b2] flex items-center justify-center text-white font-bold text-[14px] flex-shrink-0">
                    D4-5
                  </div>
                  <div className="w-0.5 h-full bg-gradient-to-b from-[#06b6d4] to-transparent mt-2"></div>
                </div>
                <div className="flex-1 pb-6">
                  <h3 className="text-[17px] font-bold text-[#1e3a5f] mb-2">苍山探秘 · 古镇休闲</h3>
                  <p className="text-[15px] leading-[1.7] text-[#666]">
                    坐索道上苍山，在洗马潭看雪山与洱海的壮美景色。下山后去沙溪古镇，感受最原始的白族文化。
                  </p>
                </div>
              </div>
            </div>

            {/* Day 6-7 */}
            <div className="relative">
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0891b2] to-[#0e7490] flex items-center justify-center text-white font-bold text-[14px] flex-shrink-0">
                    D6-7
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-[17px] font-bold text-[#1e3a5f] mb-2">慢生活 · 咖啡与读书</h3>
                  <p className="text-[15px] leading-[1.7] text-[#666]">
                    在古城找一家喜欢的咖啡馆，点一杯手冲咖啡，看看书，发发呆。这才是大理生活的正确打开方式。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 配图2 */}
        <div className="mb-3 rounded-2xl overflow-hidden">
          <ImageWithFallback 
            src="https://images.unsplash.com/photo-1713959989861-2425c95e9777?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb3VudGFpbiUyMGxhbmRzY2FwZSUyMG5hdHVyZSUyMHRyYXZlbHxlbnwxfHx8fDE3NzUwMzAzNTh8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Mountain Landscape"
            className="w-full h-auto"
          />
        </div>
        <p className="text-center text-[13px] text-[#888] mb-8 flex items-center justify-center gap-1">
          <Camera className="w-3.5 h-3.5" />
          苍山云海奇观
        </p>

        {/* 实用Tips */}
        <section className="mb-8">
          <h2 className="text-[22px] font-bold text-[#1e3a5f] mb-5 flex items-center gap-2">
            <Sun className="w-6 h-6 text-[#fbbf24]" />
            旅行小贴士
          </h2>

          <div className="space-y-3">
            <div className="flex gap-3 p-4 bg-[#fffbeb] rounded-xl border border-[#fef3c7]">
              <div className="text-[20px]">☀️</div>
              <div className="flex-1">
                <h3 className="text-[15px] font-bold text-[#92400e] mb-1">防晒很重要</h3>
                <p className="text-[14px] text-[#78350f] leading-[1.6]">大理紫外线强，记得带SPF50+的防晒霜、墨镜和帽子</p>
              </div>
            </div>

            <div className="flex gap-3 p-4 bg-[#f0f9ff] rounded-xl border border-[#e0f2fe]">
              <div className="text-[20px]">🧥</div>
              <div className="flex-1">
                <h3 className="text-[15px] font-bold text-[#075985] mb-1">昼夜温差大</h3>
                <p className="text-[14px] text-[#0c4a6e] leading-[1.6]">早晚较凉，建议带一件薄外套或披肩</p>
              </div>
            </div>

            <div className="flex gap-3 p-4 bg-[#fdf4ff] rounded-xl border border-[#fae8ff]">
              <div className="text-[20px]">💰</div>
              <div className="flex-1">
                <h3 className="text-[15px] font-bold text-[#6b21a8] mb-1">消费水平</h3>
                <p className="text-[14px] text-[#581c87] leading-[1.6]">青旅50-80元/晚，民宿150-300元/晚，普通餐食30-50元/人</p>
              </div>
            </div>
          </div>
        </section>

        {/* 结语 */}
        <section className="mb-8">
          <div className="bg-gradient-to-r from-[#0ea5e9] to-[#06b6d4] p-6 rounded-2xl text-white">
            <h3 className="text-[18px] font-bold mb-3">🌈 旅行感悟</h3>
            <p className="text-[15px] leading-[1.8] opacity-95">
              大理教会我，生活不只有眼前的苟且，还有诗和远方。在这里，时间变慢了，心也变静了。希望你也能在大理找到属于自己的那份宁静与美好。
            </p>
          </div>
        </section>

        {/* 标签 */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="px-4 py-1.5 bg-[#e0f2fe] text-[#0284c7] text-[13px] rounded-full">
            #云南旅行
          </span>
          <span className="px-4 py-1.5 bg-[#dbeafe] text-[#0369a1] text-[13px] rounded-full">
            #大理攻略
          </span>
          <span className="px-4 py-1.5 bg-[#e0f2fe] text-[#0e7490] text-[13px] rounded-full">
            #慢生活
          </span>
        </div>
      </article>
    </div>
  );
}
