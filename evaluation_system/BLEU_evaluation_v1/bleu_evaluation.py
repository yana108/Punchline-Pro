import sacrebleu

# 定义文件路径
english_path = '/Users/yana/Desktop/english_texts_Ali.txt'
human_translation_path = '/Users/yana/Desktop/aligned_chinese_texts_human_Ali.txt'
mt_translation_path = '/Users/yana/Desktop/aligned_chinese_texts_mt_Ali.txt'

# 读取参考译文和机器翻译译文
with open(human_translation_path, 'r', encoding='utf-8') as f:
    references = [line.strip() for line in f.readlines()]

with open(mt_translation_path, 'r', encoding='utf-8') as f:
    system_outputs = [line.strip() for line in f.readlines()]

# 计算 BLEU 分数
bleu = sacrebleu.BLEU()
score = bleu.corpus_score(system_outputs, [references])

# 打印 BLEU 分数
print(f"BLEU Score: {score.score:.2f}")
print(f"Details: {score}")