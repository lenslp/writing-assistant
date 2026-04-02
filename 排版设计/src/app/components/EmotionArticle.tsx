import { Heart, Clock, Eye, Coffee, Music, Moon } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

export function EmotionArticle() {
  return (
    <div className="max-w-[750px] mx-auto bg-white shadow-lg">
      <article className="px-6 pt-8 pb-6">
        {/* 标题 */}
        <h1 className="text-[28px] font-bold leading-[1.5] mb-4 text-[#3d3d3d]" style={{ fontFamily: 'serif' }}>
          深夜食堂里的温柔岁月
        </h1>
        <p className="text-[16px] text-[#999] mb-6 italic">
          —— 写给每一个孤独却温暖的灵魂
        </p>

        {/* 元信息 */}
        <div className="flex items-center justify-between py-4 border-b border-[#f0f0f0] mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#fda4af] to-[#fb7185] flex items-center justify-center text-white">
              <Heart className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[15px] font-medium text-[#3d3d3d]">温柔夜话</div>
              <div className="flex items-center gap-4 text-[13px] text-[#999]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  深夜 23:42
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  52.6k
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 开篇引语 */}
        <div className="text-center py-8 mb-6">
          <div className="inline-block">
            <p className="text-[32px] text-[#fda4af] mb-4">"</p>
            <p className="text-[17px] leading-[1.9] text-[#666] px-6 italic">
              人生就像深夜的一碗热汤<br />
              温暖的不只是胃，还有心
            </p>
            <p className="text-[32px] text-[#fda4af] text-right">„</p>
          </div>
        </div>

        {/* 主图 */}
        <div className="mb-3 rounded-2xl overflow-hidden shadow-sm">
          <ImageWithFallback 
            src="https://images.unsplash.com/photo-1514846528774-8de9d4a07023?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb3VwbGUlMjBsb3ZlJTIwcm9tYW50aWN8ZW58MXx8fHwxNzc1MDQzMzU1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Romantic Moment"
            className="w-full h-auto"
          />
        </div>
        <p className="text-center text-[13px] text-[#bbb] mb-8 italic">
          有些温暖，只在不经意间遇见
        </p>

        {/* 正文 */}
        <section className="mb-8">
          <p className="text-[16px] leading-[2] text-[#555] mb-5 indent-8">
            凌晨一点的城市，霓虹灯渐次熄灭，只有街角那家小店还亮着温柔的灯光。推开那扇木门，熟悉的铃铛声响起，老板抬头冲你微笑："今天也辛苦了。"
          </p>

          <p className="text-[16px] leading-[2] text-[#555] mb-5 indent-8">
            这是一家很普通的小店，没有豪华的装修，只有几张简朴的桌椅。但每个深夜经过的人，都会不由自主地停下脚步，因为这里有最暖心的食物，和最懂你的倾听者。
          </p>
        </section>

        {/* 分隔线装饰 */}
        <div className="flex items-center justify-center gap-3 my-8">
          <div className="w-12 h-[1px] bg-gradient-to-r from-transparent to-[#fda4af]"></div>
          <Heart className="w-4 h-4 text-[#fda4af]" />
          <div className="w-12 h-[1px] bg-gradient-to-l from-transparent to-[#fda4af]"></div>
        </div>

        {/* 场景描述卡片 */}
        <section className="mb-8">
          <div className="bg-gradient-to-br from-[#fff1f2] to-[#ffe4e6] p-6 rounded-2xl mb-6">
            <div className="flex items-start gap-3 mb-4">
              <Coffee className="w-5 h-5 text-[#fb7185] mt-1 flex-shrink-0" />
              <div>
                <h3 className="text-[17px] font-bold text-[#3d3d3d] mb-2">那碗热汤的故事</h3>
                <p className="text-[15px] leading-[1.9] text-[#666]">
                  记得第一次来这里，是在一个下雨的冬夜。刚刚加完班的我，浑身湿透，心里更是冷得透彻。老板什么都没问，只是默默端上一碗热腾腾的汤，说："先暖暖身子吧。"
                </p>
              </div>
            </div>
            <p className="text-[15px] leading-[1.9] text-[#666] pl-8">
              那一刻，眼泪差点掉下来。原来，这世界上还有人在乎你是否温暖。
            </p>
          </div>
        </section>

        {/* 配图2 */}
        <div className="mb-3 rounded-2xl overflow-hidden shadow-sm">
          <ImageWithFallback 
            src="https://images.unsplash.com/photo-1755603461859-9da81ff3afea?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3YXJtJTIwY29mZmVlJTIwcGVhY2VmdWx8ZW58MXx8fHwxNzc1MDQzMzU2fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Warm Coffee"
            className="w-full h-auto"
          />
        </div>
        <p className="text-center text-[13px] text-[#bbb] mb-8 italic">
          一杯咖啡，一段故事，一份温暖
        </p>

        {/* 感悟金句 */}
        <section className="mb-8">
          <div className="space-y-4">
            <div className="border-l-4 border-[#fda4af] pl-5 py-3 bg-[#fffbfc]">
              <p className="text-[15px] leading-[1.8] text-[#555] italic">
                "生活很难，但总有人在深夜为你留一盏灯。"
              </p>
            </div>

            <div className="border-l-4 border-[#fb7185] pl-5 py-3 bg-[#fffbfc]">
              <p className="text-[15px] leading-[1.8] text-[#555] italic">
                "有些温暖，不需要言语，一个眼神就够了。"
              </p>
            </div>

            <div className="border-l-4 border-[#f43f5e] pl-5 py-3 bg-[#fffbfc]">
              <p className="text-[15px] leading-[1.8] text-[#555] italic">
                "孤独的人不可怕，可怕的是失去感受温暖的能力。"
              </p>
            </div>
          </div>
        </section>

        {/* 继续正文 */}
        <section className="mb-8">
          <p className="text-[16px] leading-[2] text-[#555] mb-5 indent-8">
            后来，这家小店成了我的避风港。每当疲惫不堪的时候，就会来这里坐坐。有时候什么都不点，只是静静地坐着，看着老板忙碌的背影，听着锅碗瓢盆的声音，心就慢慢平静下来。
          </p>

          <p className="text-[16px] leading-[2] text-[#555] mb-5 indent-8">
            这里的常客都有自己的故事。那个总是点同一份炒饭的白领，据说在等一个人的消息；角落里戴着耳机的女孩，在用音乐疗伤；还有那对每周都来的老夫妻，已经携手走过了五十年的岁月。
          </p>
        </section>

        {/* 温暖时刻集锦 */}
        <section className="mb-8">
          <h3 className="text-[20px] font-bold text-[#3d3d3d] mb-5 text-center">
            <span className="inline-block border-b-2 border-[#fda4af] pb-1">那些温暖的瞬间</span>
          </h3>

          <div className="grid grid-cols-1 gap-4">
            <div className="flex gap-4 p-5 bg-gradient-to-r from-[#fff7ed] to-white rounded-xl">
              <div className="text-[28px]">🌟</div>
              <div>
                <h4 className="text-[15px] font-bold text-[#3d3d3d] mb-1">失恋的那个晚上</h4>
                <p className="text-[14px] text-[#666] leading-[1.7]">
                  老板递给我一碗加了糖的姜茶，说："甜一点，心就不会那么苦了。"
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-5 bg-gradient-to-r from-[#fef2f2] to-white rounded-xl">
              <div className="text-[28px]">🌸</div>
              <div>
                <h4 className="text-[15px] font-bold text-[#3d3d3d] mb-1">考试失败的深夜</h4>
                <p className="text-[14px] text-[#666] leading-[1.7]">
                  隔壁桌的陌生人轻轻拍拍我的肩："没关系，明天又是新的一天。"
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-5 bg-gradient-to-r from-[#fffbeb] to-white rounded-xl">
              <div className="text-[28px]">💫</div>
              <div>
                <h4 className="text-[15px] font-bold text-[#3d3d3d] mb-1">生日的那一天</h4>
                <p className="text-[14px] text-[#666] leading-[1.7]">
                  老板记得我随口说过的生日，偷偷在碗里放了一颗糖："生日快乐。"
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 音乐推荐 */}
        <section className="mb-8">
          <div className="bg-gradient-to-r from-[#f3f4f6] to-[#e5e7eb] p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Music className="w-5 h-5 text-[#6b7280]" />
              <h3 className="text-[16px] font-bold text-[#3d3d3d]">此刻适合听的歌</h3>
            </div>
            <div className="space-y-2">
              <p className="text-[14px] text-[#666]">🎵 《夜空中最亮的星》 - 逃跑计划</p>
              <p className="text-[14px] text-[#666]">🎵 《成全》 - 林宥嘉</p>
              <p className="text-[14px] text-[#666]">🎵 《后来》 - 刘若英</p>
            </div>
          </div>
        </section>

        {/* 结尾 */}
        <section className="mb-8">
          <p className="text-[16px] leading-[2] text-[#555] mb-5 indent-8">
            很多年以后，当你回忆起这段时光，会发现那些深夜的温暖，已经融入了你的生命。它教会你，即使在最孤独的时候，这个世界上依然有光，有爱，有人在等你。
          </p>

          <div className="bg-gradient-to-r from-[#fda4af] to-[#fb7185] p-6 rounded-2xl text-white text-center mt-6">
            <Moon className="w-6 h-6 mx-auto mb-3" />
            <p className="text-[16px] leading-[1.9] mb-2">
              愿你在深夜时分，也能遇到属于自己的温暖
            </p>
            <p className="text-[14px] opacity-90">
              晚安，孤独却温柔的你
            </p>
          </div>
        </section>

        {/* 互动区域 */}
        <div className="border-t border-[#f0f0f0] pt-6 mb-6">
          <p className="text-[14px] text-[#999] text-center mb-4">
            ❤️ 如果这篇文章温暖到了你，欢迎分享给同样需要温暖的人
          </p>
        </div>

        {/* 标签 */}
        <div className="flex flex-wrap gap-2 justify-center">
          <span className="px-4 py-1.5 bg-[#fff1f2] text-[#fb7185] text-[13px] rounded-full">
            #深夜情感
          </span>
          <span className="px-4 py-1.5 bg-[#fef2f2] text-[#f43f5e] text-[13px] rounded-full">
            #温暖治愈
          </span>
          <span className="px-4 py-1.5 bg-[#fff7ed] text-[#f97316] text-[13px] rounded-full">
            #生活感悟
          </span>
        </div>
      </article>
    </div>
  );
}
