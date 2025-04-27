import tensorflow as tf
from transformers import BertTokenizer, TFBertModel
import numpy as np
import json

class TranslationQualityModel(tf.keras.Model):
    def __init__(self):
        super(TranslationQualityModel, self).__init__()
        self.bert = TFBertModel.from_pretrained('bert-base-multilingual-cased')
        self.dropout = tf.keras.layers.Dropout(0.3)
        
        # 只定义五个维度的分类器
        self.punchline_head = tf.keras.layers.Dense(1, activation='sigmoid', name='punchline_preservation')
        self.cultural_head = tf.keras.layers.Dense(1, activation='sigmoid', name='cultural_adaptation')
        self.style_head = tf.keras.layers.Dense(1, activation='sigmoid', name='comedian_style_preservation')
        self.structure_head = tf.keras.layers.Dense(1, activation='sigmoid', name='structural_integrity')
        self.fluency_head = tf.keras.layers.Dense(1, activation='sigmoid', name='fluency')
        
    def call(self, inputs):
        input_ids = inputs['input_ids']
        attention_mask = inputs['attention_mask']
        
        outputs = self.bert(input_ids, attention_mask=attention_mask)
        pooled_output = outputs.pooler_output
        pooled_output = self.dropout(pooled_output)
        
        # 只返回五个维度的得分
        return {
            'punchline_preservation': self.punchline_head(pooled_output),
            'cultural_adaptation': self.cultural_head(pooled_output),
            'comedian_style_preservation': self.style_head(pooled_output),
            'structural_integrity': self.structure_head(pooled_output),
            'fluency': self.fluency_head(pooled_output)
        }

def load_evaluation_data(file_path):
    """加载需要评估的文本"""
    with open(file_path, 'r', encoding='utf-8') as f:
        texts = f.readlines()
    
    # 清理文本（去除空行和空格）
    texts = [text.strip() for text in texts if text.strip()]
    return texts

def evaluate_translation_quality(model_path, texts, english_texts=None):
    """评估文本翻译质量
    
    Args:
        model_path: 模型权重文件路径
        texts: 待评估的翻译文本列表
        english_texts: 可选的原文本列表，用于拼接输入
    """
    # 初始化分词器
    tokenizer = BertTokenizer.from_pretrained('bert-base-multilingual-cased')
    
    # 准备输入文本
    if english_texts is not None and len(english_texts) == len(texts):
        # 如果提供了英文原文，则将英文和中文翻译拼接在一起进行评估
        combined_texts = [f"{en} [SEP] {zh}" for en, zh in zip(english_texts, texts)]
        eval_texts = combined_texts
    else:
        # 否则只评估中文翻译
        eval_texts = texts
    
    # 编码文本
    encodings = tokenizer(
        eval_texts, 
        padding='max_length', 
        truncation=True, 
        max_length=256,  # 增加最大长度以容纳拼接后的文本
        return_tensors='tf'
    )
    
    # 创建模型实例
    model = TranslationQualityModel()
    
    # 需要先进行一次前向传播以构建模型
    dummy_input = {
        'input_ids': tf.zeros((1, 256), dtype=tf.int32),
        'attention_mask': tf.zeros((1, 256), dtype=tf.int32)
    }
    _ = model(dummy_input)
    
    # 加载训练好的权重
    model.load_weights(model_path)
    
    # 准备输入数据
    input_data = {
        'input_ids': encodings['input_ids'],
        'attention_mask': encodings['attention_mask']
    }
    
    # 获取预测分数
    predictions = model(input_data)
    
    # 整理结果
    results = {
        'punchline_preservation': predictions['punchline_preservation'].numpy().flatten(),
        'cultural_adaptation': predictions['cultural_adaptation'].numpy().flatten(),
        'comedian_style_preservation': predictions['comedian_style_preservation'].numpy().flatten(),
        'structural_integrity': predictions['structural_integrity'].numpy().flatten(),
        'fluency': predictions['fluency'].numpy().flatten()
    }
    
    return results

def calculate_overall_score(scores, i):
    """计算五个维度的简单平均值"""
    overall_score = (
        scores['punchline_preservation'][i] +
        scores['cultural_adaptation'][i] +
        scores['comedian_style_preservation'][i] +
        scores['structural_integrity'][i] +
        scores['fluency'][i]
    ) / 5.0
    
    return float(overall_score)

def calculate_weighted_score(scores, i):
    """计算加权整体得分"""
    # 定义权重 - 按照指定的分配比例
    weights = {
        'punchline_preservation': 0.35,     # 笑点保留: 35%
        'cultural_adaptation': 0.35,        # 文化适应: 35%
        'comedian_style_preservation': 0.10, # 风格保留: 10%
        'structural_integrity': 0.10,       # 结构完整: 10%
        'fluency': 0.10                     # 语言流畅: 10%
    }
    
    # 计算加权得分
    weighted_score = (
        scores['punchline_preservation'][i] * weights['punchline_preservation'] +
        scores['cultural_adaptation'][i] * weights['cultural_adaptation'] +
        scores['comedian_style_preservation'][i] * weights['comedian_style_preservation'] +
        scores['structural_integrity'][i] * weights['structural_integrity'] +
        scores['fluency'][i] * weights['fluency']
    )
    
    return float(weighted_score)

def evaluate_from_json(model_path, json_path, output_path):
    """从JSON文件加载数据并评估"""
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 提取英文原文和中文翻译
    english_texts = [item['english'] for item in data]
    chinese_texts = [item['chinese'] for item in data]
    joke_ids = [item['id'] for item in data]
    
    # 评估翻译质量
    scores = evaluate_translation_quality(model_path, chinese_texts, english_texts)
    
    # 更新JSON数据并保存
    for i, item in enumerate(data):
        # 计算简单平均和加权整体得分
        overall = calculate_overall_score(scores, i)
        weighted_overall = calculate_weighted_score(scores, i)
        
        item['translation_quality'] = {
            'punchline_preservation': float(scores['punchline_preservation'][i]),
            'cultural_adaptation': float(scores['cultural_adaptation'][i]),
            'comedian_style_preservation': float(scores['comedian_style_preservation'][i]),
            'structural_integrity': float(scores['structural_integrity'][i]),
            'fluency': float(scores['fluency'][i]),
            'overall': overall,  # 五个维度的简单平均
            'weighted_overall': weighted_overall  # 加权计算的整体评分
        }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    return data, scores

def main():
    """主函数，支持两种评估模式"""
    import argparse
    
    parser = argparse.ArgumentParser(description='评估翻译质量')
    parser.add_argument('--model', required=True, help='模型权重文件路径')
    parser.add_argument('--mode', choices=['txt', 'json'], default='txt', help='评估模式：txt或json')
    parser.add_argument('--input', required=True, help='输入文件路径')
    parser.add_argument('--output', required=True, help='输出文件路径')
    
    args = parser.parse_args()
    
    if args.mode == 'txt':
        # 从文本文件评估
        texts = load_evaluation_data(args.input)
        scores = evaluate_translation_quality(args.model, texts)
        
        # 输出简要结果
        print("\n评估结果摘要:")
        print("-" * 150)
        print("| 序号 | 文本 | 笑点保留 | 文化适应 | 风格保留 | 结构完整 | 语言流畅 | 平均评分 | 加权评分 |")
        print("-" * 150)
        
        # 收集每个文本样本的各个维度得分
        overall_scores = []
        weighted_scores = []
        dimension_scores = {
            'punchline_preservation': [],
            'cultural_adaptation': [],
            'comedian_style_preservation': [],
            'structural_integrity': [],
            'fluency': []
        }
        
        for i, text in enumerate(texts):
            # 计算简单平均和加权整体得分
            overall = calculate_overall_score(scores, i)
            overall_scores.append(overall)
            
            weighted_overall = calculate_weighted_score(scores, i)
            weighted_scores.append(weighted_overall)
            
            # 收集各维度得分
            for dim in dimension_scores:
                dimension_scores[dim].append(scores[dim][i])
            
            # 截断过长的文本以便更好地显示
            display_text = text[:30] + "..." if len(text) > 30 else text
            print(f"| {i+1:3d} | {display_text:30s} | {scores['punchline_preservation'][i]:.4f} | {scores['cultural_adaptation'][i]:.4f} | {scores['comedian_style_preservation'][i]:.4f} | {scores['structural_integrity'][i]:.4f} | {scores['fluency'][i]:.4f} | {overall:.4f} | {weighted_overall:.4f} |")
        
        # 计算各维度平均得分
        avg_scores = {
            'punchline_preservation': np.mean(scores['punchline_preservation']),
            'cultural_adaptation': np.mean(scores['cultural_adaptation']),
            'comedian_style_preservation': np.mean(scores['comedian_style_preservation']),
            'structural_integrity': np.mean(scores['structural_integrity']),
            'fluency': np.mean(scores['fluency']),
            'overall': np.mean(overall_scores),
            'weighted_overall': np.mean(weighted_scores)
        }
        
        # 计算各维度总分
        sum_scores = {
            'punchline_preservation': np.sum(scores['punchline_preservation']),
            'cultural_adaptation': np.sum(scores['cultural_adaptation']),
            'comedian_style_preservation': np.sum(scores['comedian_style_preservation']),
            'structural_integrity': np.sum(scores['structural_integrity']),
            'fluency': np.sum(scores['fluency']),
            'overall': np.sum(overall_scores),
            'weighted_overall': np.sum(weighted_scores)
        }
        
        print("-" * 150)
        print(f"平均得分: | {'':3s} | {'':30s} | {avg_scores['punchline_preservation']:.4f} | {avg_scores['cultural_adaptation']:.4f} | {avg_scores['comedian_style_preservation']:.4f} | {avg_scores['structural_integrity']:.4f} | {avg_scores['fluency']:.4f} | {avg_scores['overall']:.4f} | {avg_scores['weighted_overall']:.4f} |")
        print("-" * 150)
        print(f"总分: | {'':3s} | {'':30s} | {sum_scores['punchline_preservation']:.4f} | {sum_scores['cultural_adaptation']:.4f} | {sum_scores['comedian_style_preservation']:.4f} | {sum_scores['structural_integrity']:.4f} | {sum_scores['fluency']:.4f} | {sum_scores['overall']:.4f} | {sum_scores['weighted_overall']:.4f} |")
        print("-" * 150)
        
        # 保存详细评估结果到文件
        results = []
        for i, text in enumerate(texts):
            overall = calculate_overall_score(scores, i)
            weighted_overall = calculate_weighted_score(scores, i)
            results.append({
                "id": i+1,
                "text": text,
                "scores": {
                    "punchline_preservation": float(scores['punchline_preservation'][i]),
                    "cultural_adaptation": float(scores['cultural_adaptation'][i]),
                    "comedian_style_preservation": float(scores['comedian_style_preservation'][i]),
                    "structural_integrity": float(scores['structural_integrity'][i]),
                    "fluency": float(scores['fluency'][i]),
                    "overall": float(overall),
                    "weighted_overall": float(weighted_overall)
                }
            })
        
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump({
                "results": results,
                "average_scores": {k: float(v) for k, v in avg_scores.items()},
                "sum_scores": {k: float(v) for k, v in sum_scores.items()}
            }, f, ensure_ascii=False, indent=2)
        
    else:
        # 从JSON文件评估
        data, scores = evaluate_from_json(args.model, args.input, args.output)
        
        # 计算简单平均和加权平均得分
        overall_scores = []
        weighted_scores = []
        dimension_scores = {
            'punchline_preservation': [],
            'cultural_adaptation': [],
            'comedian_style_preservation': [],
            'structural_integrity': [],
            'fluency': []
        }
        
        for i in range(len(scores['punchline_preservation'])):
            overall = calculate_overall_score(scores, i)
            overall_scores.append(overall)
            
            weighted_overall = calculate_weighted_score(scores, i)
            weighted_scores.append(weighted_overall)
            
            # 收集各维度得分
            for dim in dimension_scores:
                dimension_scores[dim].append(scores[dim][i])
        
        # 计算各维度平均得分
        avg_scores = {
            'punchline_preservation': np.mean(scores['punchline_preservation']),
            'cultural_adaptation': np.mean(scores['cultural_adaptation']),
            'comedian_style_preservation': np.mean(scores['comedian_style_preservation']),
            'structural_integrity': np.mean(scores['structural_integrity']),
            'fluency': np.mean(scores['fluency']),
            'overall': np.mean(overall_scores),
            'weighted_overall': np.mean(weighted_scores)
        }
        
        # 计算各维度总分
        sum_scores = {
            'punchline_preservation': np.sum(scores['punchline_preservation']),
            'cultural_adaptation': np.sum(scores['cultural_adaptation']),
            'comedian_style_preservation': np.sum(scores['comedian_style_preservation']),
            'structural_integrity': np.sum(scores['structural_integrity']),
            'fluency': np.sum(scores['fluency']),
            'overall': np.sum(overall_scores),
            'weighted_overall': np.sum(weighted_scores)
        }
        
        # 输出简要统计结果
        print("\n评估结果统计:")
        print("-" * 60)
        print(f"| 评估维度 | 平均得分 | 总分 |")
        print("-" * 60)
        print(f"| 笑点保留 | {avg_scores['punchline_preservation']:.4f} | {sum_scores['punchline_preservation']:.4f} |")
        print(f"| 文化适应 | {avg_scores['cultural_adaptation']:.4f} | {sum_scores['cultural_adaptation']:.4f} |")
        print(f"| 风格保留 | {avg_scores['comedian_style_preservation']:.4f} | {sum_scores['comedian_style_preservation']:.4f} |")
        print(f"| 结构完整 | {avg_scores['structural_integrity']:.4f} | {sum_scores['structural_integrity']:.4f} |")
        print(f"| 语言流畅 | {avg_scores['fluency']:.4f} | {sum_scores['fluency']:.4f} |")
        print(f"| 平均评分 | {avg_scores['overall']:.4f} | {sum_scores['overall']:.4f} |")
        print(f"| 加权评分 | {avg_scores['weighted_overall']:.4f} | {sum_scores['weighted_overall']:.4f} |")
        print("-" * 60)
        
        # 将总分和平均分也添加到输出JSON文件中
        with open(args.output, 'r', encoding='utf-8') as f:
            output_data = json.load(f)
            
        output_data['summary'] = {
            'average_scores': {k: float(v) for k, v in avg_scores.items()},
            'sum_scores': {k: float(v) for k, v in sum_scores.items()}
        }
        
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n评估结果已保存至: {args.output}")

if __name__ == "__main__":
    main()