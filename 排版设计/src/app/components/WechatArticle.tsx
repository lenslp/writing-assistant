import { Clock, Eye, ThumbsUp, Star, MessageCircle } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

export function WechatArticle() {
  return (
    <div className="max-w-[750px] mx-auto bg-white shadow-lg">
      {/* 文章头部 */}
      <article className="px-6 pt-8 pb-6">
        {/* 标题 */}
        <h1 className="text-[28px] font-bold leading-[1.4] mb-4 text-[#1a1a1a]">
          AI大模型突破性进展：GPT-5将重新定义人机交互未来
        </h1>

        {/* 元信息 */}
        <div className="flex items-center justify-between py-4 border-b border-[#e5e5e5] mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4a90e2] to-[#7b68ee] flex items-center justify-center text-white font-bold text-sm">
              AI
            </div>
            <div>
              <div className="text-[15px] font-medium text-[#1a1a1a]">AI科技观察</div>
              <div className="flex items-center gap-4 text-[13px] text-[#888]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  2026-04-01
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  12.5k
                </span>
              </div>
            </div>
          </div>
          <button className="px-5 py-2 bg-gradient-to-r from-[#4a90e2] to-[#5b9ff5] text-white text-[14px] rounded-full hover:opacity-90 transition-opacity">
            关注
          </button>
        </div>

        {/* 引言/摘要 */}
        <div className="bg-gradient-to-r from-[#f0f7ff] to-[#f5f3ff] border-l-4 border-[#4a90e2] px-5 py-4 mb-6 rounded-r-lg">
          <p className="text-[15px] leading-[1.8] text-[#333] italic">
            最新消息显示，下一代人工智能大模型GPT-5即将在今年下半年发布，其性能将较GPT-4实现质的飞跃。本文将深入解析这一突破性进展对整个AI行业带来的深远影响。
          </p>
        </div>

        {/* 主图 */}
        <div className="mb-6 rounded-xl overflow-hidden">
          <ImageWithFallback 
            src="https://images.unsplash.com/photo-1697577418970-95d99b5a55cf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhcnRpZmljaWFsJTIwaW50ZWxsaWdlbmNlJTIwdGVjaG5vbG9neXxlbnwxfHx8fDE3NzQ5OTE3MzF8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="AI Technology"
            className="w-full h-auto"
          />
          <p className="text-center text-[13px] text-[#888] mt-2">▲ 人工智能技术正在改变世界</p>
        </div>

        {/* 正文第一部分 */}
        <section className="mb-8">
          <h2 className="text-[22px] font-bold text-[#1a1a1a] mb-4 pb-2 border-b-2 border-[#4a90e2] inline-block">
            💡 技术突破：多模态能力全面升级
          </h2>
          <p className="text-[16px] leading-[1.9] text-[#333] mb-4">
            据OpenAI内部消息人士透露，GPT-5在多模态理解方面取得了重大突破。不仅能够更精准地理解和生成文本，还具备了更强大的图像识别、视频分析和音频处理能力。
          </p>
          <p className="text-[16px] leading-[1.9] text-[#333] mb-4">
            相比GPT-4，新模型在以下几个方面实现了显著提升：
          </p>
          <ul className="space-y-3 mb-6">
            <li className="flex items-start gap-3 text-[16px] leading-[1.8] text-[#333]">
              <span className="inline-block w-2 h-2 rounded-full bg-[#4a90e2] mt-2.5 flex-shrink-0"></span>
              <span><strong className="text-[#1a1a1a]">推理能力提升300%：</strong>能够处理更复杂的逻辑推理和问题解决任务</span>
            </li>
            <li className="flex items-start gap-3 text-[16px] leading-[1.8] text-[#333]">
              <span className="inline-block w-2 h-2 rounded-full bg-[#4a90e2] mt-2.5 flex-shrink-0"></span>
              <span><strong className="text-[#1a1a1a]">上下文窗口扩展至100万tokens：</strong>可以处理更长的文档和对话历史</span>
            </li>
            <li className="flex items-start gap-3 text-[16px] leading-[1.8] text-[#333]">
              <span className="inline-block w-2 h-2 rounded-full bg-[#4a90e2] mt-2.5 flex-shrink-0"></span>
              <span><strong className="text-[#1a1a1a]">实时学习能力：</strong>能够从对话中快速学习并适应用户偏好</span>
            </li>
          </ul>
        </section>

        {/* 数据卡片 */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gradient-to-br from-[#4a90e2] to-[#5b9ff5] p-4 rounded-xl text-white text-center">
            <div className="text-[28px] font-bold mb-1">300%</div>
            <div className="text-[13px] opacity-90">推理能力提升</div>
          </div>
          <div className="bg-gradient-to-br from-[#7b68ee] to-[#9b7ff5] p-4 rounded-xl text-white text-center">
            <div className="text-[28px] font-bold mb-1">100万</div>
            <div className="text-[13px] opacity-90">Token容量</div>
          </div>
          <div className="bg-gradient-to-br from-[#50c878] to-[#6dd890] p-4 rounded-xl text-white text-center">
            <div className="text-[28px] font-bold mb-1">50+</div>
            <div className="text-[13px] opacity-90">支持语言</div>
          </div>
        </div>

        {/* 配图2 */}
        <div className="mb-6 rounded-xl overflow-hidden">
          <ImageWithFallback 
            src="https://images.unsplash.com/photo-1760629863094-5b1e8d1aae74?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyb2JvdCUyMEFJJTIwZnV0dXJlfGVufDF8fHx8MTc3NTA0MzA5NHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Robot AI Future"
            className="w-full h-auto"
          />
          <p className="text-center text-[13px] text-[#888] mt-2">▲ AI机器人将更智能地服务人类</p>
        </div>

        {/* 正文第二部分 */}
        <section className="mb-8">
          <h2 className="text-[22px] font-bold text-[#1a1a1a] mb-4 pb-2 border-b-2 border-[#7b68ee] inline-block">
            🚀 行业影响：重塑商业格局
          </h2>
          <p className="text-[16px] leading-[1.9] text-[#333] mb-4">
            GPT-5的发布预计将对多个行业产生深远影响。从内容创作到软件开发，从客户服务到教育培训，AI技术的应用场景将进一步拓展。
          </p>

          {/* 高亮引用框 */}
          <div className="bg-white border-2 border-[#7b68ee] rounded-xl p-5 mb-6 relative">
            <div className="absolute -top-3 left-6 bg-white px-3">
              <Star className="w-5 h-5 text-[#7b68ee] fill-[#7b68ee]" />
            </div>
            <p className="text-[15px] leading-[1.8] text-[#1a1a1a] font-medium italic">
              "GPT-5的推出标志着人工智能进入了一个新纪元。我们正在见证计算机科学史上最激动人心的时刻之一。"
            </p>
            <p className="text-[13px] text-[#888] mt-3 text-right">
              —— 斯坦福大学AI研究院院长
            </p>
          </div>
        </section>

        {/* 正文第三部分 */}
        <section className="mb-8">
          <h2 className="text-[22px] font-bold text-[#1a1a1a] mb-4 pb-2 border-b-2 border-[#50c878] inline-block">
            🌟 未来展望：迈向AGI的关键一步
          </h2>
          
          <p className="text-[16px] leading-[1.9] text-[#333] mb-4">
            业内专家普遍认为，GPT-5是通向通用人工智能（AGI）道路上的重要里程碑。虽然距离真正的AGI还有很长的路要走，但这次技术突破让我们看到了更清晰的未来图景。
          </p>

          {/* 配图3 */}
          <div className="mb-6 rounded-xl overflow-hidden">
            <ImageWithFallback 
              src="https://images.unsplash.com/photo-1719550371336-7bb64b5cacfa?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxuZXVyYWwlMjBuZXR3b3JrJTIwZGlnaXRhbHxlbnwxfHx8fDE3NzUwNDMwOTR8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
              alt="Neural Network"
              className="w-full h-auto"
            />
            <p className="text-center text-[13px] text-[#888] mt-2">▲ 神经网络技术的不断演进</p>
          </div>

          <p className="text-[16px] leading-[1.9] text-[#333] mb-4">
            随着技术的不断进步，AI将在以下领域发挥更大作用：
          </p>

          {/* 特色列表卡片 */}
          <div className="space-y-3 mb-6">
            <div className="flex items-start gap-4 p-4 bg-[#f0f7ff] rounded-lg border-l-4 border-[#4a90e2]">
              <div className="text-[24px]">🏥</div>
              <div>
                <h3 className="font-bold text-[16px] text-[#1a1a1a] mb-1">医疗健康</h3>
                <p className="text-[14px] text-[#666] leading-[1.7]">辅助诊断、药物研发、个性化治疗方案</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-[#f5f3ff] rounded-lg border-l-4 border-[#7b68ee]">
              <div className="text-[24px]">📚</div>
              <div>
                <h3 className="font-bold text-[16px] text-[#1a1a1a] mb-1">教育培训</h3>
                <p className="text-[14px] text-[#666] leading-[1.7]">智能导师、个性化学习路径、知识图谱构建</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-[#f0fdf4] rounded-lg border-l-4 border-[#50c878]">
              <div className="text-[24px]">💼</div>
              <div>
                <h3 className="font-bold text-[16px] text-[#1a1a1a] mb-1">企业服务</h3>
                <p className="text-[14px] text-[#666] leading-[1.7]">智能办公、数据分析、决策支持系统</p>
              </div>
            </div>
          </div>
        </section>

        {/* 结语 */}
        <section className="mb-8">
          <div className="bg-gradient-to-r from-[#1a1a1a] to-[#333] text-white p-6 rounded-xl">
            <h3 className="text-[18px] font-bold mb-3">✨ 写在最后</h3>
            <p className="text-[15px] leading-[1.8] opacity-90">
              GPT-5的到来不仅是技术的进步，更是人类智慧的延伸。在拥抱新技术的同时，我们也需要思考AI伦理、数据安全等重要议题，确保技术真正造福人类社会。
            </p>
          </div>
        </section>

        {/* 分隔线 */}
        <div className="border-t border-[#e5e5e5] my-8"></div>

        {/* 标签 */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="px-4 py-1.5 bg-[#f0f7ff] text-[#4a90e2] text-[13px] rounded-full border border-[#4a90e2]/20">
            #人工智能
          </span>
          <span className="px-4 py-1.5 bg-[#f5f3ff] text-[#7b68ee] text-[13px] rounded-full border border-[#7b68ee]/20">
            #GPT-5
          </span>
          <span className="px-4 py-1.5 bg-[#f0fdf4] text-[#50c878] text-[13px] rounded-full border border-[#50c878]/20">
            #科技前沿
          </span>
          <span className="px-4 py-1.5 bg-[#fef3f2] text-[#f87171] text-[13px] rounded-full border border-[#f87171]/20">
            #大模型
          </span>
        </div>

        {/* 互动区域 */}
        <div className="flex items-center justify-between pt-6 border-t border-[#e5e5e5]">
          <div className="flex items-center gap-6">
            <button className="flex items-center gap-2 text-[#666] hover:text-[#4a90e2] transition-colors">
              <ThumbsUp className="w-5 h-5" />
              <span className="text-[14px]">1258</span>
            </button>
            <button className="flex items-center gap-2 text-[#666] hover:text-[#4a90e2] transition-colors">
              <MessageCircle className="w-5 h-5" />
              <span className="text-[14px]">368</span>
            </button>
          </div>
          <button className="px-6 py-2 bg-[#07c160] text-white text-[14px] rounded-md hover:bg-[#06ad56] transition-colors">
            分享
          </button>
        </div>
      </article>

      {/* 推荐阅读 */}
      <div className="border-t-8 border-[#f5f5f5] px-6 py-8">
        <h3 className="text-[18px] font-bold text-[#1a1a1a] mb-4">📖 推荐阅读</h3>
        <div className="space-y-4">
          <a href="#" className="flex items-center gap-4 p-3 hover:bg-[#f9f9f9] rounded-lg transition-colors group">
            <div className="w-20 h-20 bg-gradient-to-br from-[#4a90e2] to-[#7b68ee] rounded-lg flex-shrink-0"></div>
            <div className="flex-1">
              <h4 className="text-[15px] font-medium text-[#1a1a1a] mb-1 group-hover:text-[#4a90e2]">
                深度解析：AI Agent如何改变未来工作方式
              </h4>
              <p className="text-[13px] text-[#888]">阅读量 8.2k</p>
            </div>
          </a>
          <a href="#" className="flex items-center gap-4 p-3 hover:bg-[#f9f9f9] rounded-lg transition-colors group">
            <div className="w-20 h-20 bg-gradient-to-br from-[#7b68ee] to-[#50c878] rounded-lg flex-shrink-0"></div>
            <div className="flex-1">
              <h4 className="text-[15px] font-medium text-[#1a1a1a] mb-1 group-hover:text-[#4a90e2]">
                2026年AI行业十大趋势预测
              </h4>
              <p className="text-[13px] text-[#888]">阅读量 15.6k</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
