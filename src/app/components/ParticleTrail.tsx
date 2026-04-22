import { useEffect, useRef } from "react";

class TrailNode {
  x: number = 0;
  y: number = 0;
  vx: number = 0;
  vy: number = 0;
}

// 采用弹簧物理模型生成连续、平滑的拖尾线条
class Trail {
  nodes: TrailNode[];
  color: string;
  spring: number;
  friction: number;
  width: number;
  length: number;

  constructor(color: string, spring: number, friction: number, width: number, length: number = 40) {
    this.nodes = Array.from({ length }, () => new TrailNode());
    this.color = color;
    this.spring = spring;
    this.friction = friction;
    this.width = width;
    this.length = length;
  }

  initPosition(x: number, y: number) {
    this.nodes.forEach(node => {
      node.x = x;
      node.y = y;
      node.vx = 0;
      node.vy = 0;
    });
  }

  update(mouseX: number, mouseY: number) {
    // 头部永远精准跟随目标
    this.nodes[0].x = mouseX;
    this.nodes[0].y = mouseY;

    // 尾部节点依靠弹簧物理特性依次追赶前一个节点
    for (let i = 1; i < this.length; i++) {
      const node = this.nodes[i];
      const prevNode = this.nodes[i - 1];

      const dx = prevNode.x - node.x;
      const dy = prevNode.y - node.y;

      node.vx += dx * this.spring;
      node.vy += dy * this.spring;
      node.vx *= this.friction;
      node.vy *= this.friction;

      node.x += node.vx;
      node.y += node.vy;
    }
  }

  draw(ctx: CanvasRenderingContext2D, globalOpacity: number) {
    if (globalOpacity <= 0) return;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 1; i < this.length; i++) {
      const node = this.nodes[i];
      const prevNode = this.nodes[i - 1];

      // 拖尾渐隐和变细
      const progress = 1 - (i / (this.length - 1));
      const currentWidth = this.width * progress;
      // 使用非线性指数让头部更亮、尾部柔和消失
      const currentOpacity = Math.pow(progress, 1.5) * globalOpacity;

      ctx.beginPath();
      ctx.moveTo(prevNode.x, prevNode.y);
      ctx.lineTo(node.x, node.y);
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = currentOpacity;
      ctx.lineWidth = currentWidth;
      ctx.stroke();
    }
  }
}

export function ParticleTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 创建单条具有平滑物理特性的线条，形成简洁的拖尾感，减少性能消耗
    const trail = new Trail("rgb(255, 107, 53)", 0.6, 0.45, 6, 30); // 单根主线（中等粗细，明亮）

    let animationFrameId: number;
    let mouse = { x: -100, y: -100 };
    let lastMouse = { x: -100, y: -100 };
    let globalOpacity = 0;
    let isInitialized = false;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    const handleMouseMove = (e: MouseEvent) => {
      if (!isInitialized) {
        trail.initPosition(e.clientX, e.clientY);
        isInitialized = true;
      }
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    
    window.addEventListener("mousemove", handleMouseMove);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (isInitialized) {
        // 计算鼠标速度
        const dx = mouse.x - lastMouse.x;
        const dy = mouse.y - lastMouse.y;
        const speed = Math.sqrt(dx * dx + dy * dy);
        
        lastMouse.x = mouse.x;
        lastMouse.y = mouse.y;

        // 流星效果逻辑：移动时渐显，静止时快速消散
        if (speed > 0.5) {
          globalOpacity = Math.min(1, globalOpacity + 0.15);
        } else {
          globalOpacity = Math.max(0, globalOpacity - 0.04);
        }

        // 绘制流星头部发光效果
        if (globalOpacity > 0) {
          ctx.save();
          const gradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 12);
          gradient.addColorStop(0, `rgba(255, 107, 53, ${globalOpacity})`);
          gradient.addColorStop(1, "rgba(255, 107, 53, 0)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // 更新和绘制单线条
        trail.update(mouse.x, mouse.y);
        trail.draw(ctx, globalOpacity);
      }

      animationFrameId = requestAnimationFrame(animate);
    };
    
    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[1]"
    />
  );
}