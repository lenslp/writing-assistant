import { Car, Clock, Eye, Gauge, Zap, Award, Fuel, Shield } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

export function CarArticle() {
  return (
    <div className="max-w-[750px] mx-auto bg-white shadow-lg">
      <article className="px-6 pt-8 pb-6">
        {/* 标题 */}
        <div className="mb-6">
          <div className="inline-block px-3 py-1 bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-white text-[12px] font-bold rounded-full mb-3">
            深度评测
          </div>
          <h1 className="text-[28px] font-black leading-[1.3] mb-3 text-[#1a1a1a]">
            全新奔驰EQS SUV深度测评：豪华电动SUV的天花板？
          </h1>
          <p className="text-[15px] text-[#666] leading-[1.7]">
            续航700km+，百公里加速4.5s，这台百万级纯电SUV到底值不值？
          </p>
        </div>

        {/* 元信息 */}
        <div className="flex items-center justify-between py-4 border-b-2 border-[#e5e5e5] mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1e40af] to-[#1e3a8a] flex items-center justify-center text-white">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[15px] font-bold text-[#1a1a1a]">车界观察</div>
              <div className="flex items-center gap-4 text-[13px] text-[#888]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  2026-04-01
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  45.3k
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-[#fef3c7] px-3 py-1.5 rounded-full">
            <Award className="w-4 h-4 text-[#d97706]" />
            <span className="text-[12px] font-bold text-[#d97706]">编辑推荐</span>
          </div>
        </div>

        {/* 主图 */}
        <div className="mb-3 rounded-2xl overflow-hidden">
          <ImageWithFallback 
            src="https://images.unsplash.com/photo-1742056024244-02a093dae0b5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzcG9ydHMlMjBjYXJ8ZW58MXx8fHwxNzc0OTYzMjMzfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Luxury Car"
            className="w-full h-auto"
          />
        </div>
        <p className="text-center text-[13px] text-[#888] mb-8">
          ▲ 实拍图：奔驰EQS SUV
        </p>

        {/* 核心参数卡片 */}
        <section className="mb-8">
          <h2 className="text-[20px] font-black text-[#1a1a1a] mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-[#1e40af] to-[#dc2626]"></div>
            核心参数一览
          </h2>
          
          <div className="bg-gradient-to-br from-[#1e293b] to-[#334155] p-6 rounded-2xl text-white mb-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2 text-[#94a3b8]">
                  <Gauge className="w-4 h-4" />
                  <span className="text-[12px]">动力性能</span>
                </div>
                <div className="text-[24px] font-black">4.5s</div>
                <div className="text-[12px] text-[#cbd5e1]">0-100km/h</div>
              </div>
              
              <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2 text-[#94a3b8]">
                  <Zap className="w-4 h-4" />
                  <span className="text-[12px]">续航里程</span>
                </div>
                <div className="text-[24px] font-black">720km</div>
                <div className="text-[12px] text-[#cbd5e1]">CLTC工况</div>
              </div>
              
              <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2 text-[#94a3b8]">
                  <Fuel className="w-4 h-4" />
                  <span className="text-[12px]">电池容量</span>
                </div>
                <div className="text-[24px] font-black">118kWh</div>
                <div className="text-[12px] text-[#cbd5e1]">三元锂电池</div>
              </div>
              
              <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2 text-[#94a3b8]">
                  <Award className="w-4 h-4" />
                  <span className="text-[12px]">最大功率</span>
                </div>
                <div className="text-[24px] font-black">400kW</div>
                <div className="text-[12px] text-[#cbd5e1]">双电机四驱</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl">
              <div className="text-[16px] font-bold text-[#1e40af]">108.8万</div>
              <div className="text-[12px] text-[#64748b] mt-1">官方指导价</div>
            </div>
            <div className="text-center p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl">
              <div className="text-[16px] font-bold text-[#1e40af]">5.1m</div>
              <div className="text-[12px] text-[#64748b] mt-1">车身长度</div>
            </div>
            <div className="text-center p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl">
              <div className="text-[16px] font-bold text-[#1e40af]">7座</div>
              <div className="text-[12px] text-[#64748b] mt-1">座位布局</div>
            </div>
          </div>
        </section>

        {/* 外观设计 */}
        <section className="mb-8">
          <h2 className="text-[20px] font-black text-[#1a1a1a] mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-[#dc2626] to-[#1e40af]"></div>
            外观设计：豪华与科技的完美融合
          </h2>

          <p className="text-[15px] leading-[1.9] text-[#333] mb-4">
            奔驰EQS SUV延续了EQS轿车的设计语言，采用了"弓形"设计理念。前脸的黑色封闭式格栅搭配贯穿式LED灯带，科技感十足。流线型车身不仅美观，更将风阻系数降至0.26Cd，在大型SUV中表现出色。
          </p>

          <div className="bg-gradient-to-r from-[#eff6ff] to-[#dbeafe] border-l-4 border-[#1e40af] p-5 rounded-r-xl mb-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#1e40af] flex items-center justify-center text-white flex-shrink-0">
                <span className="text-[14px] font-bold">✓</span>
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-[#1e40af] mb-2">设计亮点</h3>
                <ul className="space-y-1.5 text-[14px] text-[#334155]">
                  <li>• 数字化光束大灯，支持多种动画效果</li>
                  <li>• 21英寸AMG多辐轮毂，运动感十足</li>
                  <li>• 隐藏式门把手，提升科技质感</li>
                  <li>• 全景天窗面积达1.77㎡</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 内饰配图 */}
        <div className="mb-3 rounded-2xl overflow-hidden">
          <ImageWithFallback 
            src="https://images.unsplash.com/photo-1710083521061-c1b1701c5d95?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXIlMjBpbnRlcmlvciUyMGRhc2hib2FyZHxlbnwxfHx8fDE3NzUwMjM4Mjd8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Car Interior"
            className="w-full h-auto"
          />
        </div>
        <p className="text-center text-[13px] text-[#888] mb-8">
          ▲ 豪华科技内饰
        </p>

        {/* 内饰配置 */}
        <section className="mb-8">
          <h2 className="text-[20px] font-black text-[#1a1a1a] mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-[#1e40af] to-[#dc2626]"></div>
            内饰配置：奢华座舱体验
          </h2>

          <p className="text-[15px] leading-[1.9] text-[#333] mb-4">
            进入车内，最抢眼的莫过于横贯整个中控台的MBUX Hyperscreen超联屏，由三块屏幕组成，总尺寸达到141cm，视觉冲击力极强。
          </p>

          {/* 配置列表 */}
          <div className="space-y-3 mb-6">
            <div className="flex items-start gap-4 p-4 bg-gradient-to-r from-[#fef2f2] to-white border border-[#fecaca] rounded-xl">
              <div className="text-[28px]">🎮</div>
              <div className="flex-1">
                <h3 className="text-[15px] font-bold text-[#1a1a1a] mb-1">MBUX Hyperscreen</h3>
                <p className="text-[14px] text-[#666] leading-[1.6]">
                  141cm超大屏幕，集成AI智能助手，支持自然语音交互
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-gradient-to-r from-[#fffbeb] to-white border border-[#fde68a] rounded-xl">
              <div className="text-[28px]">🎵</div>
              <div className="flex-1">
                <h3 className="text-[15px] font-bold text-[#1a1a1a] mb-1">柏林之声音响</h3>
                <p className="text-[14px] text-[#666] leading-[1.6]">
                  15扬声器环绕立体声系统，还原演唱会级音质
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-gradient-to-r from-[#f0fdf4] to-white border border-[#bbf7d0] rounded-xl">
              <div className="text-[28px]">💺</div>
              <div className="flex-1">
                <h3 className="text-[15px] font-bold text-[#1a1a1a] mb-1">Nappa真皮座椅</h3>
                <p className="text-[14px] text-[#666] leading-[1.6]">
                  带加热/通风/按摩功能，前排支持10向电动调节
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 驾驶体验 */}
        <section className="mb-8">
          <h2 className="text-[20px] font-black text-[#1a1a1a] mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-[#dc2626] to-[#1e40af]"></div>
            试驾体验：静谧与激情并存
          </h2>

          <div className="bg-gradient-to-br from-[#1e293b] to-[#0f172a] p-6 rounded-2xl text-white mb-4">
            <h3 className="text-[17px] font-bold mb-3 flex items-center gap-2">
              <Gauge className="w-5 h-5 text-[#60a5fa]" />
              性能表现
            </h3>
            <p className="text-[15px] leading-[1.8] text-[#cbd5e1] mb-4">
              双电机四驱系统带来400kW的最大功率和855N·m的峰值扭矩，0-100km/h加速仅需4.5秒。Sport+模式下，推背感明显，完全不像一台2.7吨的大家伙。
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/10 p-3 rounded-lg text-center">
                <div className="text-[20px] font-bold text-[#60a5fa]">400kW</div>
                <div className="text-[11px] text-[#94a3b8] mt-1">最大功率</div>
              </div>
              <div className="bg-white/10 p-3 rounded-lg text-center">
                <div className="text-[20px] font-bold text-[#60a5fa]">855N·m</div>
                <div className="text-[11px] text-[#94a3b8] mt-1">峰值扭矩</div>
              </div>
              <div className="bg-white/10 p-3 rounded-lg text-center">
                <div className="text-[20px] font-bold text-[#60a5fa]">4.5s</div>
                <div className="text-[11px] text-[#94a3b8] mt-1">破百时间</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-[#ecfdf5] to-white border-l-4 border-[#10b981] p-5 rounded-r-xl">
            <h3 className="text-[15px] font-bold text-[#10b981] mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              舒适性配置
            </h3>
            <p className="text-[14px] text-[#334155] leading-[1.7]">
              空气悬挂+后轮转向系统，过弯更加灵活。车内静谧性极佳，时速120km/h时，车内噪音仅为62分贝，堪比图书馆级别。
            </p>
          </div>
        </section>

        {/* 充电配图 */}
        <div className="mb-3 rounded-2xl overflow-hidden">
          <ImageWithFallback 
            src="https://images.unsplash.com/photo-1593941707874-ef25b8b4a92b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbGVjdHJpYyUyMHZlaGljbGUlMjBjaGFyZ2luZ3xlbnwxfHx8fDE3NzQ5NzI4NzF8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="EV Charging"
            className="w-full h-auto"
          />
        </div>
        <p className="text-center text-[13px] text-[#888] mb-8">
          ▲ 支持快充技术
        </p>

        {/* 续航与充电 */}
        <section className="mb-8">
          <h2 className="text-[20px] font-black text-[#1a1a1a] mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-[#1e40af] to-[#dc2626]"></div>
            续航与充电：告别里程焦虑
          </h2>

          <p className="text-[15px] leading-[1.9] text-[#333] mb-4">
            118kWh的大容量电池组，CLTC工况下续航达到720km，高速续航也能达到600km左右。支持200kW快充，30%-80%充电仅需31分钟。
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-[#dbeafe] to-[#bfdbfe] p-5 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-5 h-5 text-[#1e40af]" />
                <h3 className="text-[15px] font-bold text-[#1e3a8a]">快充能力</h3>
              </div>
              <div className="text-[28px] font-black text-[#1e40af] mb-1">31min</div>
              <p className="text-[13px] text-[#475569]">30%-80%充电时间</p>
            </div>

            <div className="bg-gradient-to-br from-[#fef3c7] to-[#fde68a] p-5 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <Fuel className="w-5 h-5 text-[#d97706]" />
                <h3 className="text-[15px] font-bold text-[#92400e]">能耗表现</h3>
              </div>
              <div className="text-[28px] font-black text-[#d97706] mb-1">16.4</div>
              <p className="text-[13px] text-[#78350f]">kWh/100km</p>
            </div>
          </div>
        </section>

        {/* 评分卡片 */}
        <section className="mb-8">
          <h2 className="text-[20px] font-black text-[#1a1a1a] mb-4 text-center">
            综合评分
          </h2>

          <div className="space-y-3">
            {[
              { name: '外观设计', score: 9.5, color: '#1e40af' },
              { name: '内饰豪华度', score: 9.8, color: '#dc2626' },
              { name: '动力性能', score: 9.2, color: '#d97706' },
              { name: '续航能力', score: 9.0, color: '#10b981' },
              { name: '智能配置', score: 9.6, color: '#7c3aed' },
              { name: '性价比', score: 7.5, color: '#64748b' }
            ].map((item, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[14px] font-medium text-[#1a1a1a]">{item.name}</span>
                  <span className="text-[14px] font-bold" style={{ color: item.color }}>{item.score}分</span>
                </div>
                <div className="h-2 bg-[#e2e8f0] rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all"
                    style={{ 
                      width: `${item.score * 10}%`,
                      backgroundColor: item.color
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-center p-4 bg-gradient-to-r from-[#1e40af] to-[#1e3a8a] rounded-2xl text-white">
            <div className="text-[36px] font-black mb-1">9.1</div>
            <p className="text-[14px] opacity-90">综合得分</p>
          </div>
        </section>

        {/* 购车建议 */}
        <section className="mb-8">
          <div className="bg-gradient-to-r from-[#fef2f2] to-[#fee2e2] border-2 border-[#fecaca] p-6 rounded-2xl">
            <h3 className="text-[18px] font-black text-[#991b1b] mb-4 flex items-center gap-2">
              <Award className="w-5 h-5" />
              编辑观点
            </h3>
            <p className="text-[15px] leading-[1.9] text-[#450a0a] mb-4">
              奔驰EQS SUV是一台真正意义上的豪华纯电SUV标杆。无论是设计、配置还是驾驶体验，都展现了奔驰百年造车的深厚底蕴。
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-[14px] font-bold text-[#7f1d1d] mb-2">✅ 优点</h4>
                <ul className="space-y-1 text-[13px] text-[#7c2d12]">
                  <li>• 科技配置顶级</li>
                  <li>• 续航表现优秀</li>
                  <li>• 豪华氛围满分</li>
                </ul>
              </div>
              <div>
                <h4 className="text-[14px] font-bold text-[#7f1d1d] mb-2">⚠️ 缺点</h4>
                <ul className="space-y-1 text-[13px] text-[#7c2d12]">
                  <li>• 价格较高</li>
                  <li>• 后备箱空间一般</li>
                  <li>• 充电网络待完善</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 标签 */}
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          <span className="px-4 py-1.5 bg-gradient-to-r from-[#1e40af] to-[#1e3a8a] text-white text-[13px] rounded-full font-medium">
            #新能源
          </span>
          <span className="px-4 py-1.5 bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-white text-[13px] rounded-full font-medium">
            #豪华SUV
          </span>
          <span className="px-4 py-1.5 bg-gradient-to-r from-[#d97706] to-[#b45309] text-white text-[13px] rounded-full font-medium">
            #深度评测
          </span>
        </div>

        {/* 互动区 */}
        <div className="border-t-2 border-[#e5e5e5] pt-6">
          <p className="text-center text-[14px] text-[#888] mb-4">
            🚗 你觉得这台车值不值百万？欢迎评论区讨论
          </p>
        </div>
      </article>
    </div>
  );
}
