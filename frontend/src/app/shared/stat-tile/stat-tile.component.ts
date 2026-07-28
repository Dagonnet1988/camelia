import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-stat-tile',
  template: `
    <div class="stat-tile">
      <span class="label">{{ label }}</span>
      <span class="value">{{ value }}</span>
      @if (caption) {
        <span class="caption">{{ caption }}</span>
      }
    </div>
  `,
  styleUrl: './stat-tile.component.scss',
})
export class StatTileComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string;
  @Input() caption?: string;
}
