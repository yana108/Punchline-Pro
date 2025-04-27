#alignment_check
def check_alignment(aligned_reference_path, aligned_hypothesis_path):
    """检查对齐后的文件内容是否一一对应"""
    with open(aligned_reference_path, 'r', encoding='utf-8') as f_ref, \
         open(aligned_hypothesis_path, 'r', encoding='utf-8') as f_hyp:
        references = f_ref.readlines()
        hypotheses = f_hyp.readlines()

    # 检查两个文件的行数是否一致
    if len(references) != len(hypotheses):
        print(f"错误：两个文件的行数不一致。参考译文有 {len(references)} 行，机器翻译有 {len(hypotheses)} 行。")
        return

    # 检查每一行是否对应
    mismatches = []
    for i, (ref, hyp) in enumerate(zip(references, hypotheses), start=1):
        if ref.strip() == "" or hyp.strip() == "":
            mismatches.append((i, ref.strip(), hyp.strip()))

    if mismatches:
        print("发现不对应的内容：")
        for line_num, ref, hyp in mismatches:
            print(f"第 {line_num} 行:")
            print(f"参考译文: {ref}")
            print(f"机器翻译: {hyp}")
    else:
        print("所有内容均一一对应。")

# 直接在脚本中定义文件路径
aligned_reference_path = '/Users/yana/Desktop/aligned_chinese_texts_human_Ali.txt'
aligned_hypothesis_path = '/Users/yana/Desktop/aligned_chinese_texts_mt_Ali.txt'

# 调用函数检查对齐结果
check_alignment(aligned_reference_path, aligned_hypothesis_path)