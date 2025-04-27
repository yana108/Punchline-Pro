import tensorflow as tf
from transformers import BertTokenizer, TFBertModel
from sklearn.model_selection import train_test_split
import numpy as np
import pandas as pd
import json

# 加载数据
def load_data(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data

# 数据预处理 - 只保留五个评估维度
def preprocess_data(data):
    texts = []
    all_labels = {
        'punchline_preservation': [],
        'cultural_adaptation': [],
        'comedian_style_preservation': [],
        'structural_integrity': [],
        'fluency': []
    }
    
    for item in data:
        if 'translation_quality' in item:
            tq = item['translation_quality']
            # 检查每个维度是否存在，如果存在则添加到对应列表
            if all(key in tq for key in all_labels.keys()):
                texts.append(item['chinese'])
                for key in all_labels:
                    all_labels[key].append(tq[key])
    
    return texts, all_labels

# 计算平均分和加权平均分 - 用于检验数据分布
def calculate_averages(labels_dict):
    num_samples = len(next(iter(labels_dict.values())))
    averages = []
    weighted_averages = []
    
    # 定义权重
    weights = {
        'punchline_preservation': 0.35,
        'cultural_adaptation': 0.35,
        'comedian_style_preservation': 0.10,
        'structural_integrity': 0.10,
        'fluency': 0.10
    }
    
    for i in range(num_samples):
        # 简单平均
        avg = sum(labels_dict[key][i] for key in labels_dict) / len(labels_dict)
        averages.append(avg)
        
        # 加权平均
        weighted_avg = sum(labels_dict[key][i] * weights[key] for key in labels_dict)
        weighted_averages.append(weighted_avg)
    
    return averages, weighted_averages

# 加载和预处理数据
data = load_data('/Users/yana/Desktop/merged_comedy_data.json')
texts, all_labels = preprocess_data(data)

# 检查是否有数据
if not texts or not all_labels['punchline_preservation']:
    raise ValueError("No valid data found. Check the input JSON file.")

# 计算平均分和加权平均分，仅用于数据分析
simple_averages, weighted_averages = calculate_averages(all_labels)
print(f"数据集样本数: {len(texts)}")
print(f"简单平均分平均值: {np.mean(simple_averages):.4f}")
print(f"加权平均分平均值: {np.mean(weighted_averages):.4f}")

# 划分训练集和测试集 (80%训练集, 20%测试集)
train_texts, test_texts, train_labels_dict, test_labels_dict = {}, {}, {}, {}

# 先取出一个评分维度用于划分
punchline_scores = all_labels['punchline_preservation']
train_texts, test_texts, train_punchline, test_punchline = train_test_split(
    texts, punchline_scores, test_size=0.2, random_state=42)

# 为每个评分维度创建对应的训练和测试集标签
train_labels_dict = {}
test_labels_dict = {}

# 使用相同的索引划分所有标签
for key in all_labels:
    train_labels_temp, test_labels_temp, _, _ = train_test_split(
        all_labels[key], punchline_scores, test_size=0.2, random_state=42)
    train_labels_dict[key] = train_labels_temp
    test_labels_dict[key] = test_labels_temp

# 初始化Bert分词器
tokenizer = BertTokenizer.from_pretrained('bert-base-multilingual-cased')

# 对文本进行编码
def encode_texts(texts, max_length=128):
    return tokenizer(
        texts, 
        padding='max_length', 
        truncation=True, 
        max_length=max_length,
        return_tensors='tf'
    )

train_encodings = encode_texts(train_texts)
test_encodings = encode_texts(test_texts)

# 将标签转换为numpy数组
for key in train_labels_dict:
    train_labels_dict[key] = np.array(train_labels_dict[key])
    test_labels_dict[key] = np.array(test_labels_dict[key])

# 构建只有五个输出的Bert模型
class FiveDimensionQualityModel(tf.keras.Model):
    def __init__(self):
        super(FiveDimensionQualityModel, self).__init__()
        self.bert = TFBertModel.from_pretrained('bert-base-multilingual-cased')
        self.dropout = tf.keras.layers.Dropout(0.3)
        
        # 为五个维度创建独立的分类器
        self.punchline_classifier = tf.keras.layers.Dense(1, activation='sigmoid', name='punchline_preservation')
        self.cultural_classifier = tf.keras.layers.Dense(1, activation='sigmoid', name='cultural_adaptation')
        self.style_classifier = tf.keras.layers.Dense(1, activation='sigmoid', name='comedian_style_preservation')
        self.structural_classifier = tf.keras.layers.Dense(1, activation='sigmoid', name='structural_integrity')
        self.fluency_classifier = tf.keras.layers.Dense(1, activation='sigmoid', name='fluency')
        
    def call(self, inputs):
        input_ids = inputs['input_ids']
        attention_mask = inputs['attention_mask']
        
        outputs = self.bert(input_ids, attention_mask=attention_mask)
        pooled_output = outputs.pooler_output
        pooled_output = self.dropout(pooled_output)
        
        # 只返回五个基本维度的预测
        return {
            'punchline_preservation': self.punchline_classifier(pooled_output),
            'cultural_adaptation': self.cultural_classifier(pooled_output),
            'comedian_style_preservation': self.style_classifier(pooled_output),
            'structural_integrity': self.structural_classifier(pooled_output),
            'fluency': self.fluency_classifier(pooled_output)
        }

# 创建模型实例
model = FiveDimensionQualityModel()

# 编译模型 - 为每个输出使用MSE损失
optimizer = tf.keras.optimizers.Adam(learning_rate=2e-5)
loss = {
    'punchline_preservation': tf.keras.losses.MeanSquaredError(),
    'cultural_adaptation': tf.keras.losses.MeanSquaredError(),
    'comedian_style_preservation': tf.keras.losses.MeanSquaredError(),
    'structural_integrity': tf.keras.losses.MeanSquaredError(),
    'fluency': tf.keras.losses.MeanSquaredError()
}
metrics = {output: 'mae' for output in train_labels_dict.keys()}

model.compile(optimizer=optimizer, loss=loss, metrics=metrics)

# 创建训练数据集
train_dataset = tf.data.Dataset.from_tensor_slices((
    {'input_ids': train_encodings['input_ids'], 'attention_mask': train_encodings['attention_mask']},
    train_labels_dict
)).shuffle(1000).batch(16)

test_dataset = tf.data.Dataset.from_tensor_slices((
    {'input_ids': test_encodings['input_ids'], 'attention_mask': test_encodings['attention_mask']},
    test_labels_dict
)).batch(16)

# 训练模型
history = model.fit(
    train_dataset,
    epochs=3,
    validation_data=test_dataset
)

# 评估模型
evaluation = model.evaluate(test_dataset)
print("\n模型评估结果:")
for i, metric_name in enumerate(model.metrics_names):
    print(f"{metric_name}: {evaluation[i]}")

# 使用模型评估测试数据，计算平均分和加权平均分
test_predictions = model.predict(test_dataset)

# 将预测结果整合到一个数组
pred_arrays = {key: [] for key in test_predictions.keys()}
for batch in test_predictions.values():
    for key, batch_preds in zip(test_predictions.keys(), batch):
        pred_arrays[key].extend(batch_preds.flatten())

# 计算平均分和加权平均分
pred_simple_avgs = []
pred_weighted_avgs = []
weights = {
    'punchline_preservation': 0.35,
    'cultural_adaptation': 0.35,
    'comedian_style_preservation': 0.10,
    'structural_integrity': 0.10,
    'fluency': 0.10
}

for i in range(len(pred_arrays['punchline_preservation'])):
    # 简单平均
    simple_avg = sum(pred_arrays[key][i] for key in pred_arrays) / len(pred_arrays)
    pred_simple_avgs.append(simple_avg)
    
    # 加权平均
    weighted_avg = sum(pred_arrays[key][i] * weights[key] for key in pred_arrays)
    pred_weighted_avgs.append(weighted_avg)

# 计算真实值的平均分和加权平均分
true_values = {key: [] for key in test_labels_dict.keys()}
for batch_inputs, batch_labels in test_dataset:
    for key, batch_vals in batch_labels.items():
        true_values[key].extend(batch_vals.numpy())

true_simple_avgs = []
true_weighted_avgs = []

for i in range(len(true_values['punchline_preservation'])):
    # 简单平均
    simple_avg = sum(true_values[key][i] for key in true_values) / len(true_values)
    true_simple_avgs.append(simple_avg)
    
    # 加权平均
    weighted_avg = sum(true_values[key][i] * weights[key] for key in true_values)
    true_weighted_avgs.append(weighted_avg)

# 计算平均分和加权平均分的MAE
simple_avg_mae = np.mean(np.abs(np.array(pred_simple_avgs) - np.array(true_simple_avgs)))
weighted_avg_mae = np.mean(np.abs(np.array(pred_weighted_avgs) - np.array(true_weighted_avgs)))

print(f"\n简单平均分MAE: {simple_avg_mae:.4f}")
print(f"加权平均分MAE: {weighted_avg_mae:.4f}")

# 保存模型
model.save_weights('five_dimension_quality_model_weights.h5')
print("模型权重已保存为: five_dimension_quality_model_weights.h5")

# 输出训练历史
print("\n训练历史:")
for key in history.history:
    if key.startswith('val_') and not key.endswith('loss'):
        metric_name = key[4:]  # 去掉'val_'前缀
        print(f"{metric_name} - 训练: {history.history[metric_name][-1]:.4f}, 验证: {history.history[key][-1]:.4f}")

# 创建分析报告
dimension_names = {
    'punchline_preservation': '笑点保留',
    'cultural_adaptation': '文化适应',
    'comedian_style_preservation': '风格保留',
    'structural_integrity': '结构完整',
    'fluency': '语言流畅'
}

print("\n各维度评估结果:")
print("-" * 60)
print(f"| {'评估维度':^20} | {'MAE':^10} | {'权重':^10} |")
print("-" * 60)

# 计算每个维度的MAE
dimension_maes = {}
for key in dimension_names:
    mae = np.mean(np.abs(np.array(pred_arrays[key]) - np.array(true_values[key])))
    dimension_maes[key] = mae
    print(f"| {dimension_names[key]:^20} | {mae:^10.4f} | {weights.get(key, 0):^10.2f} |")

print("-" * 60)
print(f"| {'简单平均分':^20} | {simple_avg_mae:^10.4f} | {'-':^10} |")
print(f"| {'加权平均分':^20} | {weighted_avg_mae:^10.4f} | {'-':^10} |")
print("-" * 60)