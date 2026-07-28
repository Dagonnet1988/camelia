import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { Chart, ChartConfiguration } from 'chart.js/auto';

@Component({
  selector: 'app-chart',
  template: `<canvas #canvas></canvas>`,
  styles: [
    `
      :host {
        display: block;
        position: relative;
      }
    `,
  ],
})
export class ChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) config!: ChartConfiguration;
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private chart?: Chart;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config'] && this.canvasRef) {
      this.renderChart();
    }
  }

  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private renderChart(): void {
    this.chart?.destroy();
    this.chart = new Chart(this.canvasRef.nativeElement, this.config);
  }
}
