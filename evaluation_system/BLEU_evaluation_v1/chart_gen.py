import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

# Sample data based on your actual BLEU score and human evaluations
# We'll create synthetic data that maintains the correlations you specified
np.random.seed(42)  # For reproducibility

# Number of samples
n_samples = 106

# Create synthetic BLEU scores with mean around 20.7
bleu_scores = np.random.normal(20.7, 5.0, n_samples)
bleu_scores = np.clip(bleu_scores, 0, 40)  # Clip to reasonable BLEU range

# Create human evaluation scores with specified means
# and correlations with BLEU scores
def generate_correlated_score(bleu_scores, mean, correlation, std=0.05):
    # Generate random scores
    scores = np.random.normal(mean, std, len(bleu_scores))
    
    # Create a correlated version
    scores = (scores - np.mean(scores)) / np.std(scores)  # Standardize
    bleu_std = (bleu_scores - np.mean(bleu_scores)) / np.std(bleu_scores)  # Standardize BLEU
    
    # Mix independent and BLEU-correlated components to achieve target correlation
    scores = correlation * bleu_std + np.sqrt(1 - correlation**2) * scores
    
    # Scale back to original range
    scores = scores * std + mean
    scores = np.clip(scores, 0, 1)  # Clip to [0,1] range for human scores
    
    return scores

# Generate human evaluation scores with specified correlations
data = {
    'bleu': bleu_scores,
    'overall': generate_correlated_score(bleu_scores, 0.8572, 0.2219),
    'punchline_preservation': generate_correlated_score(bleu_scores, 0.8645, 0.2423),
    'cultural_adaptation': generate_correlated_score(bleu_scores, 0.8485, 0.2121),
    'comedian_style_preservation': generate_correlated_score(bleu_scores, 0.8718, 0.1196),
    'structural_integrity': generate_correlated_score(bleu_scores, 0.8590, 0.2204),
    'fluency': generate_correlated_score(bleu_scores, 0.8431, 0.1933)
}

df = pd.DataFrame(data)

# 1. BLEU Score vs Overall Human Score Scatter Plot
plt.figure(figsize=(10, 6))
plt.scatter(df['bleu'], df['overall'], alpha=0.7)

# 添加趋势线
z = np.polyfit(df['bleu'], df['overall'], 1)
p = np.poly1d(z)
plt.plot(df['bleu'], p(df['bleu']), "r--", alpha=0.8, label=f'Trend line')
plt.legend()

plt.title('BLEU Score vs Overall Human Score')
plt.xlabel('BLEU Score')
plt.ylabel('Overall Human Score')
plt.grid(True, linestyle='--', alpha=0.7)

# Add correlation coefficient
corr = np.corrcoef(df['bleu'], df['overall'])[0, 1]
plt.annotate(f'r = {corr:.4f}', xy=(0.05, 0.95), xycoords='axes fraction',
            bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="gray", alpha=0.8))

plt.tight_layout()
plt.savefig('bleu_vs_overall_scatter.png', dpi=300)
plt.close()

# 2. BLEU Components vs Human Scores Comparison Bar Chart
# Using the breakdown from your BLEU verbose score
bleu_components = {
    'BLEU-1': 58.0,
    'BLEU-2': 28.1,
    'BLEU-3': 15.1,
    'BLEU-4': 8.9,
    'BLEU Overall': 20.7,
    'Human Overall': np.mean(data['overall']) * 100  # Scale to percentage for comparison
}

plt.figure(figsize=(12, 6))
bars = plt.bar(bleu_components.keys(), bleu_components.values(), 
               color=['blue', 'blue', 'blue', 'blue', 'purple', 'green'])

plt.title('BLEU Components vs Human Scores Comparison')
plt.ylabel('Score (%)') 
plt.grid(True, axis='y', linestyle='--', alpha=0.7)

# Add value labels on top of bars
for bar in bars:
    height = bar.get_height()
    plt.text(bar.get_x() + bar.get_width()/2., height + 1,
             f'{height:.1f}%', ha='center', va='bottom')

plt.tight_layout()
plt.savefig('bleu_vs_human_bar.png', dpi=300)
plt.close()

# 3. Human Score Metrics Distribution Radar Chart
categories = ['Punchline\nPreservation', 'Cultural\nAdaptation', 
              'Style\nPreservation', 'Structural\nIntegrity', 'Fluency']
values = [np.mean(data['punchline_preservation']), 
          np.mean(data['cultural_adaptation']),
          np.mean(data['comedian_style_preservation']), 
          np.mean(data['structural_integrity']), 
          np.mean(data['fluency'])]

# 计算角度
angles = np.linspace(0, 2*np.pi, len(categories), endpoint=False)

# 添加第一个点到末尾以闭合图形
values = np.concatenate((values, [values[0]]))
angles = np.concatenate((angles, [angles[0]]))

fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(polar=True))
ax.plot(angles, values, 'o-', linewidth=2)
ax.fill(angles, values, alpha=0.25)

# 设置角度刻度和标签
ax.set_xticks(angles[:-1])  # 不包括最后一个重复的角度
ax.set_xticklabels(categories)  # 使用原始类别作为标签

ax.set_ylim(0, 1)
ax.grid(True)
plt.title('Human Score Metrics Distribution', size=15, pad=20)  # 增加pad值来调整标题距离

plt.tight_layout()
plt.savefig('human_metrics_radar.png', dpi=300)
plt.close()

# 4. BLEU vs All Metrics Scatter Plot Matrix
metrics = ['overall', 'punchline_preservation', 'cultural_adaptation', 
           'comedian_style_preservation', 'structural_integrity', 'fluency']

fig, axes = plt.subplots(2, 3, figsize=(15, 10))
axes = axes.flatten()

for i, metric in enumerate(metrics):
    axes[i].scatter(df['bleu'], df[metric], alpha=0.7)
    axes[i].set_title(f'BLEU vs {metric.replace("_", " ").title()}')
    axes[i].set_xlabel('BLEU Score')
    axes[i].set_ylabel(f'{metric.replace("_", " ").title()} Score')
    axes[i].grid(True, linestyle='--', alpha=0.7)
    
    # Add correlation coefficient
    corr = np.corrcoef(df['bleu'], df[metric])[0, 1]
    axes[i].annotate(f'r = {corr:.4f}', xy=(0.05, 0.95), xycoords='axes fraction',
                    bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="gray", alpha=0.8))

plt.tight_layout()
plt.savefig('bleu_vs_all_metrics.png', dpi=300)
plt.close()

print("All visualizations have been generated successfully!")