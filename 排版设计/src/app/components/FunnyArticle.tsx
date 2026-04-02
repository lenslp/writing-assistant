import { Laugh, Clock, Eye, Zap, TrendingUp, Sparkles } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

export function FunnyArticle() {
  return (
    <div className="max-w-[750px] mx-auto bg-white shadow-lg">
      <article className="px-6 pt-8 pb-6">
        {/* 标题 */}
        <div className="text-center mb-6">
          <h1 className="text-[30px] font-black leading-[1.3] mb-3 text-[#1a1a1a]">
            笑死！这届打工人的<span className="text-[#ff6b6b]">搞笑日常</span>
          </h1>
          <div className="flex items-center justify-center gap-2 text-[14px] text-[#ff6b6b] font-bold">
            <Zap className="w-4 h-4" />
            <span>预警：阅读过程中请勿喝水 😂</span>
          </div>
        </div>

        {/* 元信息 */}
        <div className="flex items-center justify-between py-4 border-b-2 border-dashed border-[#ffd93d] mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ffd93d] to-[#ff6b6b] flex items-center justify-center">
              <Laugh className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[15px] font-bold text-[#1a1a1a]">欢乐制造机</div>
              <div className="flex items-center gap-4 text-[13px] text-[#888]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  刚刚
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  88.8k
                </span>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-r from-[#ff6b6b] to-[#ff8e53] px-4 py-2 rounded-full">
            <div className="flex items-center gap-1 text-white text-[13px] font-bold">
              <TrendingUp className="w-4 h-4" />
              <span>爆笑热榜 #1</span>
            </div>
          </div>
        </div>

        {/* 开场白 */}
        <div className="bg-gradient-to-r from-[#fff9e6] to-[#fff3e0] border-2 border-[#ffd93d] p-5 rounded-2xl mb-6 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 text-[80px] opacity-20">😂</div>
          <p className="text-[16px] leading-[1.8] text-[#333] relative z-10">
            <strong className="text-[#ff6b6b]">前方高能！</strong> 
            今天盘点一下打工人的爆笑瞬间，看完保证你能笑出腹肌！不信你试试 🤪
          </p>
        </div>

        {/* 主图 */}
        <div className="mb-3 rounded-2xl overflow-hidden border-4 border-[#ffd93d]">
          <ImageWithFallback 
            src="https://images.unsplash.com/photo-1744710891892-f131fdbd48af?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmdW5ueSUyMGNhdCUyMHBsYXlpbmd8ZW58MXx8fHwxNzc1MDQzMzU2fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Funny Cat"
            className="w-full h-auto"
          />
        </div>
        <p className="text-center text-[13px] text-[#888] mb-8">
          👆 社畜本畜
        </p>

        {/* 搞笑场景1 */}
        <section className="mb-6">
          <div className="bg-gradient-to-br from-[#ff6b6b] to-[#ff8e53] p-1 rounded-2xl mb-6">
            <div className="bg-white p-5 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-[24px]">🎭</div>
                <h2 className="text-[20px] font-black text-[#1a1a1a]">
                  场景一：早会翻车现场
                </h2>
              </div>
              <div className="space-y-3">
                <div className="bg-[#f8f9fa] p-4 rounded-xl">
                  <p className="text-[15px] text-[#333] mb-2">
                    <strong className="text-[#ff6b6b]">老板：</strong>"小王，你来说说这周的工作计划。"
                  </p>
                  <p className="text-[15px] text-[#333] mb-2">
                    <strong className="text-[#4ecdc4]">小王：</strong>"呃...这周计划...摸鱼...啊不是，是...是..."
                  </p>
                  <p className="text-[15px] text-[#333]">
                    <strong className="text-[#ffd93d]">全场：</strong>😂😂😂
                  </p>
                </div>
                <div className="bg-[#fff9e6] p-3 rounded-lg text-center">
                  <p className="text-[14px] text-[#ff6b6b] font-bold">
                    💀 社死指数：★★★★★
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 表情包式卡片 */}
        <section className="mb-6">
          <h2 className="text-[20px] font-black text-[#1a1a1a] mb-4 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[#ffd93d]" />
            打工人真实写照
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gradient-to-br from-[#fff9e6] to-[#ffe8cc] p-4 rounded-2xl text-center border-2 border-[#ffd93d]">
              <div className="text-[40px] mb-2">😴</div>
              <p className="text-[14px] font-bold text-[#333] mb-1">周一早上</p>
              <p className="text-[12px] text-[#666]">灵魂未醒 躯壳已到</p>
            </div>
            <div className="bg-gradient-to-br from-[#ffe8f0] to-[#ffd6e5] p-4 rounded-2xl text-center border-2 border-[#ff6b6b]">
              <div className="text-[40px] mb-2">🤑</div>
              <p className="text-[14px] font-bold text-[#333] mb-1">发工资当天</p>
              <p className="text-[12px] text-[#666]">短暂富豪 仅限1天</p>
            </div>
            <div className="bg-gradient-to-br from-[#e8f5e9] to-[#c8e6c9] p-4 rounded-2xl text-center border-2 border-[#4caf50]">
              <div className="text-[40px] mb-2">🏃</div>
              <p className="text-[14px] font-bold text-[#333] mb-1">周五下班</p>
              <p className="text-[12px] text-[#666]">跑得比兔子快</p>
            </div>
            <div className="bg-gradient-to-br from-[#e3f2fd] to-[#bbdefb] p-4 rounded-2xl text-center border-2 border-[#2196f3]">
              <div className="text-[40px] mb-2">😱</div>
              <p className="text-[14px] font-bold text-[#333] mb-1">周日晚上</p>
              <p className="text-[12px] text-[#666]">明日恐惧症发作</p>
            </div>
          </div>
        </section>

        {/* 配图2 */}
        <div className="mb-3 rounded-2xl overflow-hidden border-4 border-[#4ecdc4]">
          <ImageWithFallback 
            src="https://images.unsplash.com/photo-1658268887724-115013678353?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoYXBweSUyMHBlb3BsZSUyMGxhdWdoaW5nfGVufDF8fHx8MTc3NDk1MDkwNnww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Happy People"
            className="w-full h-auto"
          />
        </div>
        <p className="text-center text-[13px] text-[#888] mb-8">
          👆 成功下班的我们
        </p>

        {/* 搞笑场景2 */}
        <section className="mb-6">
          <div className="bg-gradient-to-br from-[#4ecdc4] to-[#44a9a0] p-1 rounded-2xl mb-6">
            <div className="bg-white p-5 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-[24px]">💻</div>
                <h2 className="text-[20px] font-black text-[#1a1a1a]">
                  场景二：Bug修复大战
                </h2>
              </div>
              <div className="space-y-3">
                <p className="text-[15px] leading-[1.8] text-[#333]">
                  程序员小李花了3个小时找Bug，最后发现...
                </p>
                <div className="bg-[#fff9e6] p-4 rounded-xl border-l-4 border-[#ffd93d]">
                  <p className="text-[24px] text-center mb-2">👇👇👇</p>
                  <p className="text-[18px] text-center font-black text-[#ff6b6b]">
                    少打了一个分号 "；"
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[40px]">🤡</p>
                  <p className="text-[14px] text-[#888] mt-2">小丑竟是我自己</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 金句合集 */}
        <section className="mb-6">
          <h2 className="text-[20px] font-black text-[#1a1a1a] mb-4 text-center">
            <span className="bg-gradient-to-r from-[#ffd93d] to-[#ff6b6b] text-transparent bg-clip-text">
              打工人语录精选 TOP 5
            </span>
          </h2>
          <div className="space-y-3">
            {[
              { emoji: "😤", text: "早起的鸟儿有虫吃，我不想当鸟也不想当虫" },
              { emoji: "🤔", text: "年轻人不要太急躁，你该下班的时候，自然就下班了" },
              { emoji: "💪", text: "只要我跑得够快，周一就追不上我！" },
              { emoji: "🎯", text: "摸鱼一时爽，一直摸鱼一直爽" },
              { emoji: "🌟", text: "今天的努力是为了明天能更好地摸鱼" }
            ].map((item, index) => (
              <div key={index} className="flex items-center gap-3 p-4 bg-gradient-to-r from-white to-[#f8f9fa] border-2 border-[#e9ecef] rounded-xl hover:border-[#ffd93d] transition-colors">
                <div className="text-[28px] flex-shrink-0">{item.emoji}</div>
                <p className="text-[15px] text-[#333] font-medium">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 投票互动 */}
        <section className="mb-8">
          <div className="bg-gradient-to-br from-[#667eea] to-[#764ba2] p-6 rounded-2xl text-white">
            <h3 className="text-[18px] font-black mb-4 text-center">
              🗳️ 互动时间：你最想吐槽的是？
            </h3>
            <div className="space-y-3">
              <button className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm p-3 rounded-xl text-left transition-all">
                <p className="text-[15px]">A. 周一早会 (38%)</p>
                <div className="h-2 bg-white/30 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-white rounded-full" style={{width: '38%'}}></div>
                </div>
              </button>
              <button className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm p-3 rounded-xl text-left transition-all">
                <p className="text-[15px]">B. 老板的"紧急任务" (45%)</p>
                <div className="h-2 bg-white/30 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-white rounded-full" style={{width: '45%'}}></div>
                </div>
              </button>
              <button className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm p-3 rounded-xl text-left transition-all">
                <p className="text-[15px]">C. 找不到的Bug (17%)</p>
                <div className="h-2 bg-white/30 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-white rounded-full" style={{width: '17%'}}></div>
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* 结尾彩蛋 */}
        <section className="mb-8">
          <div className="border-4 border-dashed border-[#ffd93d] p-6 rounded-2xl bg-gradient-to-br from-[#fff9e6] to-white">
            <div className="text-center">
              <p className="text-[40px] mb-3">🎊</p>
              <p className="text-[18px] font-black text-[#1a1a1a] mb-3">
                看到这里的都是真爱！
              </p>
              <p className="text-[15px] text-[#666] leading-[1.8] mb-4">
                生活已经很累了，不如让我们一起笑对人生吧！<br />
                记住：快乐是自己给的，搞笑也是一种生活态度 😎
              </p>
              <div className="flex items-center justify-center gap-2 text-[14px] text-[#ff6b6b]">
                <span className="animate-pulse">👉</span>
                <span className="font-bold">点个赞再走呗</span>
                <span className="animate-pulse">👈</span>
              </div>
            </div>
          </div>
        </section>

        {/* 标签 */}
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          <span className="px-4 py-1.5 bg-gradient-to-r from-[#ffd93d] to-[#ffed4e] text-[#333] text-[13px] rounded-full font-bold">
            #搞笑日常
          </span>
          <span className="px-4 py-1.5 bg-gradient-to-r from-[#ff6b6b] to-[#ff8e53] text-white text-[13px] rounded-full font-bold">
            #打工人
          </span>
          <span className="px-4 py-1.5 bg-gradient-to-r from-[#4ecdc4] to-[#44a9a0] text-white text-[13px] rounded-full font-bold">
            #爆笑
          </span>
        </div>

        {/* 互动区 */}
        <div className="border-t-2 border-dashed border-[#e9ecef] pt-6">
          <p className="text-center text-[14px] text-[#888] mb-3">
            😂 笑了就点个赞，笑出声了就分享给朋友！
          </p>
          <div className="flex justify-center gap-4">
            <button className="px-6 py-2 bg-gradient-to-r from-[#ff6b6b] to-[#ff8e53] text-white rounded-full font-bold hover:shadow-lg transition-shadow">
              哈哈哈哈 666
            </button>
            <button className="px-6 py-2 bg-gradient-to-r from-[#ffd93d] to-[#ffed4e] text-[#333] rounded-full font-bold hover:shadow-lg transition-shadow">
              分享快乐
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
