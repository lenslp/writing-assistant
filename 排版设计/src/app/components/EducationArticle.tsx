import { BookOpen, Clock, Eye, Lightbulb, Target, TrendingUp } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

export function EducationArticle() {
  return (
    <div className="max-w-[750px] mx-auto bg-white shadow-lg">
      <article className="px-6 pt-8 pb-6">
        {/* 标题 */}
        <h1 className="text-[28px] font-bold leading-[1.4] mb-4 text-[#2c3e50]">
          高效学习法：如何在30天内掌握一门新技能
        </h1>

        {/* 元信息 */}
        <div className="flex items-center justify-between py-4 border-b border-[#e5e5e5] mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ff9a56] to-[#ff6b6b] flex items-center justify-center text-white">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[15px] font-medium text-[#2c3e50]">学习进化论</div>
              <div className="flex items-center gap-4 text-[13px] text-[#888]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  2026-04-01
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  25.8k
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 导语 */}
        <div className="bg-gradient-to-r from-[#fff5eb] to-[#ffe8d9] px-5 py-4 rounded-xl mb-6">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-6 h-6 text-[#ff9a56] flex-shrink-0 mt-0.5" />
            <p className="text-[15px] leading-[1.8] text-[#333]">
              想学新技能却总是半途而废？本文将分享一套经过验证的高效学习方法，帮助你在短时间内实现质的飞跃。
            </p>
          </div>
        </div>

        {/* 主图 */}
        <div className="mb-6 rounded-xl overflow-hidden">
          <ImageWithFallback 
            src="https://images.unsplash.com/photo-1606761568499-6d2451b23c66?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzdHVkZW50cyUyMHN0dWR5aW5nJTIwY2xhc3Nyb29tfGVufDF8fHx8MTc3NTAxNDE3N3ww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Students Learning"
            className="w-full h-auto"
          />
        </div>

        {/* 核心方法 */}
        <section className="mb-8">
          <h2 className="text-[22px] font-bold text-[#2c3e50] mb-5 flex items-center gap-2">
            <span className="w-1 h-6 bg-gradient-to-b from-[#ff9a56] to-[#ff6b6b] rounded-full"></span>
            三步学习法：从入门到精通
          </h2>

          {/* 步骤卡片 */}
          <div className="space-y-4 mb-6">
            <div className="relative pl-12 pb-6 border-l-2 border-[#ff9a56] last:border-transparent last:pb-0">
              <div className="absolute left-0 -translate-x-1/2 w-8 h-8 rounded-full bg-gradient-to-br from-[#ff9a56] to-[#ff6b6b] flex items-center justify-center text-white font-bold text-[14px]">
                1
              </div>
              <h3 className="text-[18px] font-bold text-[#2c3e50] mb-2">明确学习目标</h3>
              <p className="text-[15px] leading-[1.8] text-[#666] mb-3">
                使用SMART原则设定具体、可衡量、可实现的学习目标。避免"我要学好英语"这样模糊的目标，而应该是"每天学习30分钟，三个月内掌握1000个常用词汇"。
              </p>
              <div className="bg-[#fff5eb] p-3 rounded-lg">
                <p className="text-[14px] text-[#ff9a56] font-medium">💡 Tips：将大目标拆分成每周的小目标，更容易坚持</p>
              </div>
            </div>

            <div className="relative pl-12 pb-6 border-l-2 border-[#ffa726] last:border-transparent last:pb-0">
              <div className="absolute left-0 -translate-x-1/2 w-8 h-8 rounded-full bg-gradient-to-br from-[#ffa726] to-[#fb8c00] flex items-center justify-center text-white font-bold text-[14px]">
                2
              </div>
              <h3 className="text-[18px] font-bold text-[#2c3e50] mb-2">刻意练习</h3>
              <p className="text-[15px] leading-[1.8] text-[#666] mb-3">
                不是简单的重复，而是针对性地练习弱项。每次练习都要走出舒适区，持续挑战自己的极限。
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-[14px] text-[#666]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ffa726]"></span>
                  专注练习最薄弱的环节
                </li>
                <li className="flex items-center gap-2 text-[14px] text-[#666]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ffa726]"></span>
                  获得即时反馈并调整
                </li>
                <li className="flex items-center gap-2 text-[14px] text-[#666]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ffa726]"></span>
                  保持高度集中的注意力
                </li>
              </ul>
            </div>

            <div className="relative pl-12">
              <div className="absolute left-0 -translate-x-1/2 w-8 h-8 rounded-full bg-gradient-to-br from-[#ff7043] to-[#f4511e] flex items-center justify-center text-white font-bold text-[14px]">
                3
              </div>
              <h3 className="text-[18px] font-bold text-[#2c3e50] mb-2">及时复习巩固</h3>
              <p className="text-[15px] leading-[1.8] text-[#666] mb-3">
                遵循艾宾浩斯遗忘曲线，在最佳时机进行复习，让知识真正进入长期记忆。
              </p>
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center p-2 bg-[#fff5eb] rounded-lg">
                  <div className="text-[16px] font-bold text-[#ff7043]">第1天</div>
                  <div className="text-[12px] text-[#888] mt-1">第一次</div>
                </div>
                <div className="text-center p-2 bg-[#fff5eb] rounded-lg">
                  <div className="text-[16px] font-bold text-[#ff7043]">第3天</div>
                  <div className="text-[12px] text-[#888] mt-1">第二次</div>
                </div>
                <div className="text-center p-2 bg-[#fff5eb] rounded-lg">
                  <div className="text-[16px] font-bold text-[#ff7043]">第7天</div>
                  <div className="text-[12px] text-[#888] mt-1">第三次</div>
                </div>
                <div className="text-center p-2 bg-[#fff5eb] rounded-lg">
                  <div className="text-[16px] font-bold text-[#ff7043]">第30天</div>
                  <div className="text-[12px] text-[#888] mt-1">第四次</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 配图2 */}
        <div className="mb-8 rounded-xl overflow-hidden">
          <ImageWithFallback 
            src="https://images.unsplash.com/photo-1542725752-e9f7259b3881?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxib29rcyUyMGVkdWNhdGlvbiUyMGxlYXJuaW5nfGVufDF8fHx8MTc3NDk4NDUzNnww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Books Education"
            className="w-full h-auto"
          />
        </div>

        {/* 学习工具推荐 */}
        <section className="mb-8">
          <h2 className="text-[22px] font-bold text-[#2c3e50] mb-5 flex items-center gap-2">
            <span className="w-1 h-6 bg-gradient-to-b from-[#ff9a56] to-[#ff6b6b] rounded-full"></span>
            高效学习工具包
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-gradient-to-br from-[#fff5eb] to-white border border-[#ffe8d9] rounded-xl">
              <div className="text-[24px] mb-2">📝</div>
              <h3 className="text-[15px] font-bold text-[#2c3e50] mb-1">思维导图</h3>
              <p className="text-[13px] text-[#666]">理清知识结构</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-[#fff5eb] to-white border border-[#ffe8d9] rounded-xl">
              <div className="text-[24px] mb-2">⏰</div>
              <h3 className="text-[15px] font-bold text-[#2c3e50] mb-1">番茄工作法</h3>
              <p className="text-[13px] text-[#666]">保持专注力</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-[#fff5eb] to-white border border-[#ffe8d9] rounded-xl">
              <div className="text-[24px] mb-2">🎯</div>
              <h3 className="text-[15px] font-bold text-[#2c3e50] mb-1">费曼学习法</h3>
              <p className="text-[13px] text-[#666]">以教促学</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-[#fff5eb] to-white border border-[#ffe8d9] rounded-xl">
              <div className="text-[24px] mb-2">📊</div>
              <h3 className="text-[15px] font-bold text-[#2c3e50] mb-1">学习记录</h3>
              <p className="text-[13px] text-[#666]">可视化进度</p>
            </div>
          </div>
        </section>

        {/* 成功案例 */}
        <section className="mb-8">
          <div className="bg-gradient-to-r from-[#ff9a56] to-[#ff7043] p-6 rounded-xl text-white">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5" />
              <h3 className="text-[18px] font-bold">真实案例</h3>
            </div>
            <p className="text-[15px] leading-[1.8] mb-3 opacity-95">
              学员小王采用这套方法，30天内从零基础到能够独立开发小程序，关键在于每天坚持2小时的刻意练习和定期复习。
            </p>
            <div className="flex items-center gap-4 text-[14px]">
              <div className="flex items-center gap-1">
                <TrendingUp className="w-4 h-4" />
                <span>学习效率提升200%</span>
              </div>
            </div>
          </div>
        </section>

        {/* 总结 */}
        <section className="mb-8">
          <div className="border-2 border-dashed border-[#ff9a56] p-5 rounded-xl bg-[#fffbf7]">
            <h3 className="text-[16px] font-bold text-[#2c3e50] mb-3 flex items-center gap-2">
              <span className="text-[20px]">✍️</span>
              写在最后
            </h3>
            <p className="text-[15px] leading-[1.8] text-[#666]">
              学习是一场马拉松，不是短跑。掌握正确的方法后，最重要的是坚持。记住：每天进步一点点，30天后你会感谢现在努力的自己。
            </p>
          </div>
        </section>

        {/* 标签 */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="px-4 py-1.5 bg-[#fff5eb] text-[#ff9a56] text-[13px] rounded-full">
            #高效学习
          </span>
          <span className="px-4 py-1.5 bg-[#fff5eb] text-[#ff7043] text-[13px] rounded-full">
            #技能提升
          </span>
          <span className="px-4 py-1.5 bg-[#fff5eb] text-[#ffa726] text-[13px] rounded-full">
            #自我成长
          </span>
        </div>
      </article>
    </div>
  );
}
