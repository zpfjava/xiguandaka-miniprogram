// 学习计划服务
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StudyPlan } from '@prisma/client';

export interface CreateStudyPlanDto {
  title: string;
  subject: string;
  description?: string;
  notes?: string;           // 前端备注字段（兼容 description）
  frequency?: string;
  customWeekdays?: string;    // 自定义频率选中的星期，如 "1,3,5" 表示周一三五
  targetCount?: number;
  starsReward?: number;
}

export interface UpdateStudyPlanDto {
  title?: string;
  subject?: string;
  description?: string;
  notes?: string;        // 前端兼容字段
  frequency?: string;
  customWeekdays?: string;  // 自定义频率选中的星期
  targetCount?: number;
  starsReward?: number;
  isActive?: boolean;
  endDate?: Date | string;
}

@Injectable()
export class StudyPlansService {
  constructor(private prisma: PrismaService) {}

  /**
   * 将前端频率文本标准化为数据库存储值
   * "每周 一、三、五" → { frequency: 'custom', customWeekdays: '1,3,5' }
   * "每天" → { frequency: 'daily', customWeekdays: null }
   */
  private normalizeFrequency(freq: string | undefined): { frequency: string; customWeekdays: string | null } {
    if (!freq) return { frequency: 'daily', customWeekdays: null };

    // 自定义频率：以"每周"开头且包含中文数字
    if (freq.startsWith('每周 ') && /[一二三四五六日]/.test(freq)) {
      const dayMap: Record<string, string> = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '日': '0' };
      const days: string[] = [];
      for (const ch of freq) {
        if (dayMap[ch]) days.push(dayMap[ch]);
      }
      return { frequency: 'custom', customWeekdays: days.sort().join(',') };
    }

    // 预设频率映射
    const presetMap: Record<string, string> = {
      '每天': 'daily',
      '每周': 'weekly',
      '每周 3 次': 'weekly_3',
      '每周 5 次': 'weekly_5',
      '工作日': 'weekdays',
      '自定义': 'custom',
    };
    return { frequency: presetMap[freq] || freq, customWeekdays: null };
  }

  /**
   * 安全将值转为整数（处理前端传来的字符串数字）
   */
  private toInt(val: any, fallback: number): number {
    const n = parseInt(val, 10);
    return isNaN(n) ? fallback : n;
  }

  // 创建学习计划
  async create(userId: string, data: CreateStudyPlanDto): Promise<StudyPlan> {
    const { frequency, customWeekdays } = this.normalizeFrequency(data.frequency);
    // 统一计算 description：兼容前端 notes 字段，自定义频率时加 WEEKDAYS 前缀
    const baseDesc = data.description || data.notes || '';
    const finalDescription = customWeekdays
      ? `[WEEKDAYS:${customWeekdays}]${baseDesc}`
      : baseDesc || null;

    return this.prisma.studyPlan.create({
      data: {
        userId,
        title: String(data.title || '').trim(),
        subject: String(data.subject || '').trim(),
        description: finalDescription,
        frequency,
        targetCount: this.toInt(data.targetCount, 1),
        starsReward: this.toInt(data.starsReward, 5),
      },
    });
  }

  // 英文频率→中文频率映射（用于返回前端展示）
  private static readonly FREQUENCY_DISPLAY_MAP: Record<string, string> = {
    daily: '每天',
    weekly: '每周',
    weekly_3: '每周 3 次',
    weekly_5: '每周 5 次',
    weekdays: '工作日',
    custom: '自定义',
  };

  // 星期数字→中文名称映射
  private static readonly WEEKDAY_NAMES: Record<string, string> = {
    '0': '日', '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六',
  };

  // 将数据库记录转换为前端友好格式
  private toFrontendFormat(plan: StudyPlan & { _count?: { checkins: number } }): any {
    // Prisma 返回的是普通 JS 对象，直接展开即可
    const obj: any = { ...(plan as any) };
    // 频率转中文
    if (obj.frequency) {
      // 如果是 custom 且 description 中包含 WEEKDAYS 信息，生成友好的频率文本
      if (obj.frequency === 'custom' && obj.description && obj.description.startsWith('[WEEKDAYS:')) {
        const match = obj.description.match(/^\[WEEKDAYS:(\d+,?\d*)\](.*)$/);
        if (match) {
          const dayNums = match[1].split(',').filter(Boolean).sort();
          const dayNames = dayNums.map((d: string) => StudyPlansService.WEEKDAY_NAMES[d] || d);
          obj.frequency = '每周 ' + dayNames.join('、');
          obj.description = match[2] || ''; // 去掉 WEEKDAYS 前缀后的真实备注
        } else {
          obj.frequency = StudyPlansService.FREQUENCY_DISPLAY_MAP[obj.frequency] || obj.frequency;
        }
      } else {
        obj.frequency = StudyPlansService.FREQUENCY_DISPLAY_MAP[obj.frequency] || obj.frequency;
      }
    }
    // description 兼容为 notes（前端使用 notes 字段）
    if (obj.description !== undefined && obj.notes === undefined) {
      obj.notes = obj.description;
    }
    // 前端进度条需要的字段：completedCount（已完成次数）、totalCount（目标次数）
    obj.completedCount = obj._count?.checkins || 0;
    obj.totalCount = obj.targetCount || 30;
    return obj;
  }

  // 获取用户的所有学习计划
  async findAll(userId: string, includeInactive = false): Promise<StudyPlan[]> {
    const rawPlans = await this.prisma.studyPlan.findMany({
      where: {
        userId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { checkins: true },
        },
      },
    });

    // 转换为前端友好格式（频率中文化、description→notes）
    return rawPlans.map((plan) => this.toFrontendFormat(plan));
  }

  // 获取单个学习计划
  async findOne(id: string, userId: string): Promise<StudyPlan> {
    const plan = await this.prisma.studyPlan.findUnique({
      where: { id },
      include: {
        checkins: {
          orderBy: { checkinAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('学习计划不存在');
    }

    if (plan.userId !== userId) {
      throw new ForbiddenException('无权访问此计划');
    }

    return plan;
  }

  // 更新学习计划
  async update(id: string, userId: string, data: UpdateStudyPlanDto): Promise<StudyPlan> {
    await this.findOne(id, userId); // 验证权限

    // 处理前端字段映射和清理无效值（确保类型安全）
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = String(data.title).trim();
    if (data.subject !== undefined) updateData.subject = String(data.subject).trim();
    if (data.targetCount !== undefined) updateData.targetCount = this.toInt(data.targetCount, 1);
    if (data.starsReward !== undefined) updateData.starsReward = this.toInt(data.starsReward, 5);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.endDate !== undefined && data.endDate !== '') {
      updateData.endDate = new Date(data.endDate);
    }

    // 统一处理频率和 description（两者耦合，必须一起处理）
    const newFrequency = data.frequency !== undefined ? data.frequency : undefined;
    const userDescription = data.description || data.notes || undefined; // 前端传的备注

    if (newFrequency !== undefined || userDescription !== undefined) {
      // 获取当前计划的原始 description（用于提取 WEEKDAYS 前缀和基础备注）
      const existingPlan = await this.prisma.studyPlan.findUnique({ where: { id } });
      let baseDesc = '';
      if (existingPlan?.description) {
        const match = existingPlan.description.match(/^\[WEEKDAYS:\d+,?\d*\](.*)$/);
        baseDesc = match ? match[1] : existingPlan.description;
      }

      // 如果用户明确传了新的 description/notes，以用户输入为准；否则保留原有备注
      if (userDescription !== undefined) {
        baseDesc = userDescription;
      }

      // 处理频率
      if (newFrequency !== undefined) {
        const { frequency, customWeekdays } = this.normalizeFrequency(newFrequency);
        updateData.frequency = frequency;
        if (customWeekdays) {
          // 自定义频率：加上 WEEKDAYS 前缀
          updateData.description = `[WEEKDAYS:${customWeekdays}]${baseDesc}`;
        } else {
          // 非自定义频率：确保清除 WEEKDAYS 前缀，使用纯净的 description
          updateData.description = baseDesc || null;
        }
      } else {
        // 频率没变，只更新 description
        // 保留原有的 WEEKDAYS 前缀（如果有）
        if (existingPlan?.description?.startsWith('[WEEKDAYS:')) {
          const match = existingPlan.description.match(/^\[WEEKDAYS:\d+,?\d*\](.*)$/);
          const weekPrefix = match ? existingPlan.description.match(/^\[WEEKDAYS:\d+,?\d*\]/)?.[0] : '';
          updateData.description = `${weekPrefix}${baseDesc}`;
        } else {
          updateData.description = baseDesc || null;
        }
      }
    }

    return this.toFrontendFormat(
      await this.prisma.studyPlan.update({
        where: { id },
        data: updateData,
      })
    );
  }

  // 删除学习计划
  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id, userId); // 验证权限
    await this.prisma.studyPlan.delete({ where: { id } });
  }

  // 获取今日打卡进度
  async getTodayProgress(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const plans = await this.prisma.studyPlan.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        checkins: {
          where: {
            checkinAt: {
              gte: today,
              lt: tomorrow,
            },
          },
        },
      },
    });

    return plans.map((plan) => ({
      id: plan.id,
      title: plan.title,
      subject: plan.subject,
      targetCount: plan.targetCount,
      completedCount: plan.checkins.length,
      starsReward: plan.starsReward,
      isCompleted: plan.checkins.length >= plan.targetCount,
    }));
  }

  // 获取学科统计
  async getSubjectStats(userId: string) {
    const plans = await this.prisma.studyPlan.findMany({
      where: { userId },
      include: {
        _count: { select: { checkins: true } },
      },
    });

    const stats: Record<string, { plans: number; checkins: number }> = {};

    for (const plan of plans) {
      if (!stats[plan.subject]) {
        stats[plan.subject] = { plans: 0, checkins: 0 };
      }
      stats[plan.subject].plans++;
      stats[plan.subject].checkins += plan._count.checkins;
    }

    return Object.entries(stats).map(([subject, data]) => ({
      subject,
      ...data,
    }));
  }
}
