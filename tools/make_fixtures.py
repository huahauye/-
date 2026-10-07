"""Generates small Chinese patent-style PDFs for end-to-end testing.

PyMuPDF ships CJK fonts, so the generated pages produce real extractable text
(which is what the parser and the OCR/IMM pipeline expect).

    python make_fixtures.py [output_dir]
"""

import pathlib
import sys

import fitz

_HERE = pathlib.Path(__file__).resolve().parent

OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else str(_HERE / "fixtures"))
OUT.mkdir(parents=True, exist_ok=True)


def write_pdf(name: str, lines: list[str]) -> pathlib.Path:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    y = 60
    for line in lines:
        page.insert_text((50, y), line, fontname="china-s", fontsize=11)
        y += 20
        if y > 800:
            page = doc.new_page(width=595, height=842)
            y = 60
    path = OUT / name
    doc.save(path)
    doc.close()
    print(f"{path} ({path.stat().st_size} bytes)")
    return path


APPLICATION = [
    "发明专利申请文件",
    "申请号：CN202310123456.7",
    "发明名称：一种基于深度学习的图像去噪方法及装置",
    "",
    "权利要求书",
    "1. 一种基于深度学习的图像去噪方法，其特征在于，包括：",
    "   获取待处理的含噪图像；",
    "   将所述含噪图像输入去噪神经网络，所述去噪神经网络包括特征提取模块和重建模块；",
    "   通过所述特征提取模块提取多尺度特征，并对所述多尺度特征进行注意力加权；",
    "   通过所述重建模块输出去噪后的图像。",
    "",
    "2. 根据权利要求1所述的方法，其特征在于，所述注意力加权包括：",
    "   计算各尺度特征的通道注意力权重；",
    "   按照所述通道注意力权重对所述多尺度特征进行加权融合。",
    "",
    "3. 根据权利要求1所述的方法，其特征在于，所述去噪神经网络在训练时采用",
    "   混合损失函数，所述混合损失函数包括像素级损失和感知损失。",
    "",
    "4. 一种基于深度学习的图像去噪装置，其特征在于，包括：",
    "   获取模块，用于获取待处理的含噪图像；",
    "   处理模块，用于将所述含噪图像输入去噪神经网络并输出去噪后的图像。",
    "",
    "5. 一种电子设备，包括存储器、处理器及存储在所述存储器上的计算机程序，",
    "   其特征在于，所述处理器执行所述计算机程序时实现权利要求1至4任一项所述的方法。",
]

OFFICE_ACTION = [
    "国家知识产权局",
    "审查意见通知书",
    "申请号：CN202310123456.7",
    "发文序号：2024-12345678",
    "发文日：2024年05月20日",
    "",
    "一、审查的依据",
    "根据专利法第三十五条第一款的规定，对上述申请进行实质审查。",
    "",
    "二、审查意见",
    "1. 权利要求1不具备专利法第二十二条第三款规定的创造性。",
    "   对比文件1（D1，US20180260373A1）公开了一种图像去噪方法，其公开了获取含噪图像、",
    "   利用神经网络进行去噪等特征。权利要求1与对比文件1的区别技术特征在于：",
    "   对多尺度特征进行注意力加权。然而，上述区别技术特征是本领域的常规技术手段，",
    "   因此权利要求1不具备突出的实质性特点和显著的进步。",
    "",
    "2. 权利要求2的附加技术特征已被对比文件2（D2，CN110123456A）公开。",
    "",
    "3. 权利要求3的附加技术特征属于本领域的公知常识。",
    "",
    "4. 权利要求5请求保护一种电子设备，其技术方案已在对比文件1中公开。",
    "",
    "三、答复期限",
    "申请人应当在收到本通知书之日起四个月内陈述意见，逾期不答复的，",
    "本申请将被视为撤回。",
    "",
    "审查员：张某某",
]

DESCRIPTION = [
    "说明书",
    "申请号：CN202310123456.7",
    "发明名称：一种基于深度学习的图像去噪方法及装置",
    "",
    "技术领域",
    "[0001] 本申请涉及图像处理技术领域，尤其涉及一种基于深度学习的图像去噪方法及装置。",
    "",
    "背景技术",
    "[0002] 现有的图像去噪方法在噪声较强时容易丢失图像的结构信息。",
    "",
    "发明内容",
    "[0003] 本申请提供一种基于深度学习的图像去噪方法，通过提取多尺度特征并对多尺度特征",
    "进行注意力加权，能够在不同尺度上保留图像的结构信息。",
    "[0004] 进一步地，通过计算各尺度特征的通道注意力权重并加权融合，能够强化对去噪更有",
    "价值的特征、抑制噪声相关的特征。",
    "[0005] 与仅使用单一尺度特征的方案相比，本申请在不同尺度上充分提取并有效利用图像特征，",
    "从而提高了去噪效果。",
    "[0006] 可选地，训练时采用包括像素级损失和感知损失的混合损失函数，以在去除噪声的同时",
    "保留图像的细节与纹理。",
    "",
    "具体实施方式",
    "[0007] 在一个实施例中，去噪神经网络包括特征提取模块和重建模块。特征提取模块依次",
    "提取多个尺度的特征图，并按照通道注意力权重对多个尺度的特征图进行加权融合；",
    "重建模块根据加权融合后的特征图输出去噪后的图像。",
    "[0008] 在一个实施例中，通道注意力权重由全局平均池化与两层全连接网络计算得到。",
    "",
    "附图说明",
    "[0009] 图1是本申请实施例提供的图像去噪方法的流程示意图。",
]

PRIOR_ART = [
    "US20180260373A1",
    "IMAGE DENOISING USING A CONVOLUTIONAL NEURAL NETWORK",
    "",
    "Abstract",
    "A method for denoising an image includes receiving a noisy image, applying a",
    "convolutional neural network to the noisy image, and outputting a denoised image.",
    "The convolutional neural network includes a feature extraction stage and a",
    "reconstruction stage.",
    "",
    "Description",
    "[0001] The present disclosure relates to image processing, and more particularly",
    "to image denoising using deep learning.",
    "[0002] Conventional image denoising methods include block matching and 3D filtering.",
    "[0003] In one embodiment, the feature extraction stage extracts multi-scale features",
    "from the noisy image. In another embodiment, the reconstruction stage generates the",
    "denoised image from the extracted features.",
    "",
    "Claims",
    "1. A method for denoising an image, comprising:",
    "   receiving a noisy image;",
    "   applying a convolutional neural network to the noisy image; and",
    "   outputting a denoised image.",
]

PRIOR_ART_D2 = [
    "CN110123456A",
    "一种图像特征的通道注意力加权方法",
    "申请公布号：CN110123456A",
    "",
    "摘要",
    "本发明公开了一种图像特征的通道注意力加权方法，对卷积神经网络输出的多尺度特征图",
    "分别计算通道注意力权重，并按照所述权重对多尺度特征图进行加权融合。",
    "",
    "权利要求书",
    "1. 一种图像特征的通道注意力加权方法，其特征在于，包括：",
    "   获取卷积神经网络输出的多尺度特征图；",
    "   对每个尺度的特征图进行全局平均池化，得到通道描述向量；",
    "   根据所述通道描述向量计算通道注意力权重；",
    "   按照所述通道注意力权重对所述多尺度特征图进行加权融合。",
    "",
    "说明书",
    "[0001] 本发明涉及图像处理技术领域。",
    "[0002] 现有技术中，多尺度特征图通常被直接拼接或相加，各通道的重要性未被区分。",
    "[0003] 本发明的通道注意力加权方法能够突出重要通道并抑制无关通道，从而提高",
    "      后续图像处理任务的精度。",
]

if __name__ == "__main__":
    write_pdf("application.pdf", APPLICATION)
    write_pdf("description.pdf", DESCRIPTION)
    write_pdf("office-action.pdf", OFFICE_ACTION)
    write_pdf("d1-us20180260373.pdf", PRIOR_ART)
    write_pdf("d2-cn110123456.pdf", PRIOR_ART_D2)
